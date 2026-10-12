"""The only module that talks to a model provider (TRD §10).

Deviation from TRD §10.1, recorded here on purpose: the TRD wants the verifier from a different
model *family* than the writer. The owner has only a Gemini key, so the verifier is a different
configured Gemini model (LLM_MODEL_VERIFIER must differ from LLM_MODEL_WRITER). Revisit when a
second provider with approved data terms is available.

What the gateway does: task registry, tier routing, JSON-schema structured output validated in
code (one repair retry, then error class `validation`), refusal or empty output as
`model_refused`, timeouts, backoff with jitter on 429/5xx/timeouts, a PII guard (I-10), and
untrusted text only in datamarked blocks of extraction tasks (I-4). Each attempt yields a
CallRecord; the caller persists them to llm_calls. Cost controls here: a per-task thinking level
(hidden thinking is billed as output), thinking tokens counted in tokens_out, and a response cache
for tasks whose output depends only on their input (job_extract). Not here: per-user budgets and
spend caps (they need the database; the core layer owns them).
"""

import hashlib
import json
import random
import time
from collections.abc import Callable, MutableMapping
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import ClassVar, Protocol

from pydantic import BaseModel, SecretStr, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.llm import schemas
from app.truth.redact import find_pii

PROMPTS_DIR = Path(__file__).parent / "prompts"
CACHE_MAX = 2000


class Tier(StrEnum):
    FAST = "fast"
    WRITER = "writer"
    VERIFIER = "verifier"


class ErrorClass(StrEnum):
    TIMEOUT = "timeout"
    RATE_LIMITED = "rate_limited"
    PROVIDER = "provider_error"
    VALIDATION = "validation"
    MODEL_REFUSED = "model_refused"
    PII_BLOCKED = "pii_blocked"


@dataclass(frozen=True)
class Task:
    name: str
    schema: type[BaseModel]
    tier: Tier
    timeout_s: float = 30
    max_retries: int = 2  # transient retries per attempt (429, 5xx, timeout)
    max_output_tokens: int = 4096
    untrusted_input: bool = False  # only extraction tasks may receive raw untrusted text (I-4)
    pii_guard: bool = True  # refuse to send emails/phones/URLs (I-10); job postings are not user data
    thinking_level: str = "low"  # Gemini 3 thinking; "low" keeps hidden (billed) thinking near zero
    cacheable: bool = False  # output depends only on the input, so identical input reuses it (any user)

    @property
    def prompt(self) -> str:
        return (PROMPTS_DIR / f"{self.name}.md").read_text()

    @property
    def prompt_version(self) -> str:
        schema = json.dumps(self.schema.model_json_schema(), sort_keys=True)
        return hashlib.sha256((self.prompt + "\n" + schema).encode()).hexdigest()[:16]


TASKS: dict[str, Task] = {
    t.name: t
    for t in [
        Task("resume_extract", schemas.ResumeExtract, Tier.FAST, 60, max_output_tokens=16384,
             untrusted_input=True),
        Task("profile_enrich", schemas.ProfileEnrich, Tier.FAST),
        Task("job_extract", schemas.JobExtract, Tier.FAST, 60, max_output_tokens=8192,
             untrusted_input=True, pii_guard=False, cacheable=True),
        Task("taxonomy_pick", schemas.TaxonomyPick, Tier.FAST, 15, max_output_tokens=256),
        Task("resume_write", schemas.ResumeWrite, Tier.WRITER, 60, max_output_tokens=8192),
        Task("statement_verify", schemas.StatementVerify, Tier.VERIFIER, 60, max_output_tokens=4096),
        Task("requirement_map", schemas.RequirementMap, Tier.FAST, 45, max_output_tokens=8192),
    ]
}


@dataclass
class CallRecord:
    """One provider attempt; maps onto the llm_calls row (trace id and user id added by the caller)."""

    task: str
    model: str
    prompt_version: str
    attempt: int
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    error_class: ErrorClass | None = None
    cache_hit: bool = False


@dataclass
class LLMResult:
    output: BaseModel
    model: str
    prompt_version: str
    calls: list[CallRecord]


class LLMError(Exception):
    def __init__(self, error_class: ErrorClass, message: str, calls: list[CallRecord]):
        super().__init__(f"{error_class}: {message}")
        self.error_class = error_class
        self.calls = calls


# ---- provider interface -------------------------------------------------------------------------


@dataclass(frozen=True)
class ProviderRequest:
    model: str
    system: str
    user: str
    json_schema: dict
    timeout_s: float
    max_output_tokens: int
    thinking_level: str = "low"


@dataclass(frozen=True)
class ProviderResponse:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0
    refused: bool = False


class TransientError(Exception):
    """Retryable provider failure: 429, 5xx or timeout."""

    def __init__(self, error_class: ErrorClass, message: str = ""):
        super().__init__(message or str(error_class))
        self.error_class = error_class


class Provider(Protocol):
    def generate(self, req: ProviderRequest) -> ProviderResponse: ...


class GeminiProvider:
    _REFUSAL_REASONS: ClassVar[set[str]] = {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE"}

    def __init__(self, api_key: str):
        from google import genai

        self._client = genai.Client(api_key=api_key)

    def generate(self, req: ProviderRequest) -> ProviderResponse:
        import httpx
        from google.genai import errors, types

        config = types.GenerateContentConfig(
            system_instruction=req.system,
            response_mime_type="application/json",
            response_json_schema=req.json_schema,
            max_output_tokens=req.max_output_tokens,
            temperature=0,
            thinking_config=types.ThinkingConfig(thinking_level=req.thinking_level),
            http_options=types.HttpOptions(timeout=int(req.timeout_s * 1000)),
        )
        try:
            r = self._client.models.generate_content(model=req.model, contents=req.user, config=config)
        except errors.APIError as e:
            if e.code == 429:
                raise TransientError(ErrorClass.RATE_LIMITED, str(e)) from e
            if e.code and e.code >= 500:
                raise TransientError(ErrorClass.PROVIDER, str(e)) from e
            raise  # 4xx other than 429 is a bug or config error: not retryable
        except httpx.TimeoutException as e:
            raise TransientError(ErrorClass.TIMEOUT, str(e)) from e

        usage = r.usage_metadata
        finish = r.candidates[0].finish_reason if r.candidates else None
        blocked = bool(r.prompt_feedback and r.prompt_feedback.block_reason)
        refused = blocked or (finish is not None and finish.name in self._REFUSAL_REASONS)
        return ProviderResponse(
            text=r.text or "",
            tokens_in=(usage.prompt_token_count or 0) if usage else 0,
            # Thinking is billed as output but not in candidates_token_count: count both.
            tokens_out=((usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)) if usage else 0,
            refused=refused,
        )


class FakeLLM:
    """Test provider: replays scripted replies in order and records every request. Never networked."""

    def __init__(self, replies: list[str | dict | ProviderResponse | Exception]):
        self.replies = list(replies)
        self.requests: list[ProviderRequest] = []

    def generate(self, req: ProviderRequest) -> ProviderResponse:
        self.requests.append(req)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, dict):
            reply = json.dumps(reply)
        if isinstance(reply, str):
            return ProviderResponse(text=reply, tokens_in=len(req.user) // 4, tokens_out=len(reply) // 4)
        return reply


# ---- gateway ------------------------------------------------------------------------------------


class LLMSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: SecretStr
    llm_model_fast: str
    llm_model_writer: str
    llm_model_verifier: str


def datamark(text: str) -> str:
    """Wrap untrusted text in a delimited block; delimiter look-alikes inside are neutralized."""
    text = text.replace("<<<", "‹‹‹").replace(">>>", "›››")
    return f"<<<UNTRUSTED_DOCUMENT\n{text}\nUNTRUSTED_DOCUMENT>>>"


class Gateway:
    def __init__(
        self,
        provider: Provider,
        models: dict[Tier, str],
        sleep: Callable[[float], None] = time.sleep,
        backoff_base_s: float = 1.0,
        cache: MutableMapping[str, str] | None = None,
    ):
        missing = [t for t in Tier if not models.get(t)]
        if missing:
            raise ValueError(f"missing model id for tiers: {', '.join(missing)}")
        if models[Tier.VERIFIER] == models[Tier.WRITER]:
            raise ValueError("LLM_MODEL_VERIFIER must differ from LLM_MODEL_WRITER (TRD §7.4)")
        self.provider = provider
        self.models = models
        self._sleep = sleep
        self._backoff_base_s = backoff_base_s
        self.cache = cache

    def run(self, task_name: str, data: dict | BaseModel, untrusted_text: str | None = None) -> LLMResult:
        """Run a task. `data` is the structured input; `untrusted_text` only for extraction tasks.

        Raises LLMError (with all CallRecords) on validation, refusal, PII or exhausted retries.
        """
        task = TASKS[task_name]
        model = self.models[task.tier]
        version = task.prompt_version
        calls: list[CallRecord] = []

        if untrusted_text is not None and not task.untrusted_input:
            raise ValueError(f"{task_name} must not receive raw untrusted text (I-4)")
        payload = data.model_dump_json() if isinstance(data, BaseModel) else json.dumps(data, default=str)
        user = "INPUT:\n" + payload
        if untrusted_text is not None:
            user += "\n\n" + datamark(untrusted_text)
        if task.pii_guard and find_pii(user):
            raise LLMError(ErrorClass.PII_BLOCKED, "contact details in model input; redact first", calls)

        cache_key = None
        if task.cacheable and self.cache is not None:
            cache_key = hashlib.sha256(f"{task.name}\0{version}\0{model}\0{user}".encode()).hexdigest()
            if (hit := self.cache.get(cache_key)) is not None:
                calls.append(CallRecord(task.name, model, version, attempt=1, cache_hit=True))
                return LLMResult(task.schema.model_validate_json(hit), model, version, calls)

        schema = task.schema.model_json_schema()
        for repair in (False, True):
            req = ProviderRequest(model, task.prompt, user, schema, task.timeout_s, task.max_output_tokens,
                                  task.thinking_level)
            resp = self._call(task, req, version, calls)
            record = calls[-1]
            if resp.refused or not resp.text.strip():
                record.error_class = ErrorClass.MODEL_REFUSED
                raise LLMError(ErrorClass.MODEL_REFUSED, "model refused or returned nothing", calls)
            try:
                output = task.schema.model_validate_json(resp.text)
            except ValidationError as e:
                record.error_class = ErrorClass.VALIDATION
                if repair:
                    break
                problems = "; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}"
                                     for err in e.errors(include_input=False)[:10])
                user += f"\n\nYour previous reply did not match the JSON schema ({problems}). Reply again."
                continue
            if cache_key is not None:
                if len(self.cache) >= CACHE_MAX:
                    self.cache.pop(next(iter(self.cache)))  # oldest first (dict insertion order)
                self.cache[cache_key] = output.model_dump_json()
            return LLMResult(output, model, version, calls)
        raise LLMError(ErrorClass.VALIDATION, "output failed schema validation after one repair", calls)

    def _call(self, task: Task, req: ProviderRequest, version: str, calls: list[CallRecord]) -> ProviderResponse:
        for retry in range(task.max_retries + 1):
            record = CallRecord(task.name, req.model, version, attempt=len(calls) + 1)
            calls.append(record)
            start = time.monotonic()
            try:
                resp = self.provider.generate(req)
            except TransientError as e:
                record.latency_ms = int((time.monotonic() - start) * 1000)
                record.error_class = e.error_class
                if retry == task.max_retries:
                    raise LLMError(e.error_class, str(e), calls) from e
                # Exponential backoff with full jitter.
                self._sleep(random.uniform(0, self._backoff_base_s * 2**retry))
                continue
            record.latency_ms = int((time.monotonic() - start) * 1000)
            record.tokens_in, record.tokens_out = resp.tokens_in, resp.tokens_out
            return resp
        raise AssertionError("unreachable")


def build_gateway(settings: LLMSettings | None = None) -> Gateway:
    """Production gateway from env (GEMINI_API_KEY, LLM_MODEL_FAST/WRITER/VERIFIER)."""
    s = settings or LLMSettings()
    if not s.gemini_api_key.get_secret_value():
        raise ValueError("GEMINI_API_KEY is not set")
    provider = GeminiProvider(s.gemini_api_key.get_secret_value())
    models = {Tier.FAST: s.llm_model_fast, Tier.WRITER: s.llm_model_writer, Tier.VERIFIER: s.llm_model_verifier}
    # ponytail: in-process cache, so each worker pays once per distinct job text; swap in a
    # Postgres-backed MutableMapping when several workers run (TRD §10.1 response cache).
    return Gateway(provider, models, cache={})
