"""Code checks on a written resume statement (TRD §7.4, invariant I-2).

Each check compares the statement only with the fact versions it cites. Reasons are the exact
text shown to the user. The verifier model (semantic support) and style checks live elsewhere.

Known limits: tools are found only through the alias table (unknown tool names are left to the
verifier); responsibility verbs come from verb_classes.yaml (English only).
"""

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from functools import cache
from pathlib import Path

import yaml

from app.truth import numbers
from app.truth.numbers import Quantity

NEEDS_CITATION = {"candidate_fact", "summary"}
CHECKS = ("citation", "numbers", "dates", "employer_title", "tools", "responsibility", "completion")


@dataclass(frozen=True)
class FactVersion:
    id: str  # fact version id (what statements cite)
    label: str  # shown to the user, e.g. "F-15"
    text: str  # description, including any outcome text
    responsibility_level: int  # 1 contributed, 2 owned, 3 led, 4 managed
    completion: str = "completed"  # planned | in_progress | completed
    employer: str | None = None
    title: str | None = None
    start: date | None = None
    end: date | None = None  # None means ongoing
    tools: tuple[str, ...] = ()  # skill ids or raw labels


@dataclass(frozen=True)
class Statement:
    type: str  # candidate_fact | summary | connective
    text: str
    cited_fact_version_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class CheckResult:
    check: str
    passed: bool
    reasons: tuple[str, ...] = ()


def passed(results: list[CheckResult]) -> bool:
    return all(r.passed for r in results)


def check_statement(
    stmt: Statement,
    facts: Mapping[str, FactVersion],
    aliases: Mapping[str, str] | None = None,
    as_of: date | None = None,
    terms: Iterable[str] = (),
) -> list[CheckResult]:
    """`facts`: the user's confirmed, current fact versions by id. `aliases`: alias -> skill id.

    `terms`: the user's skill names; with every fact's tools they are the skill/tool vocabulary a
    summary line may only use when its cited facts mention the term.
    """
    aliases = {k.lower(): v for k, v in (aliases or {}).items()}
    as_of = as_of or date.today()
    cited = [facts[i] for i in stmt.cited_fact_version_ids if i in facts]
    fails: dict[str, list[str]] = {name: [] for name in CHECKS}

    if stmt.type in NEEDS_CITATION and not stmt.cited_fact_version_ids:
        fails["citation"].append("This line doesn't cite any of your confirmed facts.")
    elif len(cited) < len(stmt.cited_fact_version_ids):
        fails["citation"].append("This line cites a fact that isn't confirmed and current.")

    fails["numbers"] = _numbers(stmt.text, cited, as_of)
    fails["dates"] = _dates(stmt.text, cited)
    fails["employer_title"] = _employer_title(stmt.text, cited, facts.values())
    fails["tools"] = _tools(stmt.text, cited, aliases)
    if stmt.type == "summary":
        vocab = {*terms, *(t for f in facts.values() for t in f.tools)}
        fails["tools"] += _summary_terms(stmt.text, cited, vocab, fails["tools"])
    fails["responsibility"] = _responsibility(stmt.text, cited)
    fails["completion"] = _completion(stmt.text, cited)
    return [CheckResult(name, not fails[name], tuple(fails[name])) for name in CHECKS]


def _labels(cited: list[FactVersion]) -> str:
    return ", ".join(f.label for f in cited) or "(none cited)"


def _months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month


def _allowed_quantities(cited: list[FactVersion], as_of: date) -> list[Quantity]:
    sources = [s for f in cited for s in (f.text, f.employer, f.title) if s]
    allowed = [q for s in sources for q in numbers.extract(s)]
    for f in cited:
        for d in (f.start, f.end):
            if d:
                allowed.append(Quantity(Decimal(d.year), "", None, str(d.year)))
        # The only permitted derivation: duration from dates (exact months, or whole years).
        if f.start:
            months = _months_between(f.start, f.end or as_of)
            allowed.append(Quantity(Decimal(months), "months", None, f"{months} months"))
            allowed.append(Quantity(Decimal(months // 12 * 12), "months", None, "years"))
    return allowed


def _numbers(text: str, cited: list[FactVersion], as_of: date) -> list[str]:
    allowed = _allowed_quantities(cited, as_of)
    out = []
    for q in numbers.extract(text):
        if not any(numbers.same(q, a) for a in allowed):
            reason = f'"{q.raw}" isn\'t in your fact {_labels(cited)}'
            if len(cited) == 1:
                reason += f' (it says: "{cited[0].text}")'
            out.append(reason + ".")
    return out


_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_MONTH_YEAR_RE = re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b", re.IGNORECASE)


def _dates(text: str, cited: list[FactVersion]) -> list[str]:
    known = {(d.year, d.month) for f in cited for d in (f.start, f.end) if d}
    out = []
    for m in _MONTH_YEAR_RE.finditer(text):
        if (int(m.group(2)), _MONTHS.index(m.group(1).lower()) + 1) not in known:
            out.append(f'"{m.group(0)}" doesn\'t match the dates in your fact {_labels(cited)}.')
    return out


def _mentions(text: str, name: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(name)}(?!\w)", text, re.IGNORECASE) is not None


def _employer_title(text: str, cited: list[FactVersion], all_facts) -> list[str]:
    out = []
    for attr, noun in (("employer", "employer"), ("title", "title")):
        own = [getattr(f, attr).lower() for f in cited if getattr(f, attr)]
        others = {getattr(f, attr) for f in all_facts if getattr(f, attr)}
        for name in sorted(others):
            # A name contained in (or containing) a cited value is the same entity, e.g. "Infosys BPM".
            if any(name.lower() in o or o in name.lower() for o in own):
                continue
            if _mentions(text, name):
                out.append(f'This line names {name}, which isn\'t the {noun} in your fact {_labels(cited)}.')
    return out


def _tools(text: str, cited: list[FactVersion], aliases: Mapping[str, str]) -> list[str]:
    if not aliases:
        return []
    have = {aliases.get(t.lower(), t.lower()) for f in cited for t in f.tools}
    # Longest alias first, so "React Native" is not read as "React".
    # ponytail: one regex per call over the whole alias table; precompile if the table grows large.
    alt = "|".join(re.escape(a) for a in sorted(aliases, key=len, reverse=True))
    pattern = re.compile(rf"(?<![\w+#])(?:{alt})(?![\w+#])", re.IGNORECASE)
    out = []
    for m in pattern.finditer(text):
        if aliases[m.group(0).lower()] not in have:
            out.append(f'"{m.group(0)}" isn\'t listed in your fact {_labels(cited)}.')
    return out


def _summary_terms(text: str, cited: list[FactVersion], vocab: set[str], flagged: list[str]) -> list[str]:
    """A summary draws on many facts, so every skill/tool it names must be in a fact it cites (text or tools)."""
    out = []
    for term in sorted({t for t in vocab if len(t.strip()) > 1}, key=str.lower):
        m = re.search(rf"(?<![\w+#]){re.escape(term)}(?![\w+#])", text, re.IGNORECASE)
        if not m or any(f'"{m.group(0)}"'.lower() in r.lower() for r in flagged + out):
            continue
        if not any(_mentions(f.text, term) or term.lower() in (t.lower() for t in f.tools) for f in cited):
            out.append(f'"{m.group(0)}" isn\'t in your fact {_labels(cited)}.')
    return out


@cache
def _verb_lexicon() -> tuple[dict[str, int], dict[int, str]]:
    data = yaml.safe_load((Path(__file__).parent / "verb_classes.yaml").read_text())
    levels = data["levels"]
    verbs = {v: levels[cls] for cls, words in data["verbs"].items() for v in words}
    return verbs, {n: cls for cls, n in levels.items()}


def _responsibility(text: str, cited: list[FactVersion]) -> list[str]:
    verbs, names = _verb_lexicon()
    found = [(verbs[w.lower()], w) for w in re.findall(r"[A-Za-z]+", text) if w.lower() in verbs]
    if not found:
        return []
    level, verb = max(found, key=lambda x: x[0])
    if not cited:
        return [f'"{verb}" makes a claim, but this line cites no fact.']
    # ponytail: compares with the strongest cited fact; per-clause attribution needs the verifier.
    top = max(cited, key=lambda f: f.responsibility_level)
    if level > top.responsibility_level:
        return [f'Your fact {top.label} says you {names[top.responsibility_level]}; "{verb}" claims more.']
    return []


_IN_PROGRESS_RE = re.compile(
    r"\b(currently|ongoing|in[ -]progress|underway|planned|planning|will|upcoming|working on)\b", re.IGNORECASE
)
_DONE_RE = re.compile(r"\b(completed|finished|delivered|launched|shipped|released|deployed|achieved)\b", re.IGNORECASE)
_IRREGULAR_PAST = {"built", "led", "drove", "grew", "won", "ran", "made", "wrote", "brought", "oversaw"}


def _completion(text: str, cited: list[FactVersion]) -> list[str]:
    unfinished = [f for f in cited if f.completion in ("planned", "in_progress")]
    if not unfinished or _IN_PROGRESS_RE.search(text):
        return []
    first = (re.findall(r"[A-Za-z]+", text) or [""])[0].lower()
    if _DONE_RE.search(text) or first.endswith("ed") or first in _IRREGULAR_PAST:
        f = unfinished[0]
        state = "planned" if f.completion == "planned" else "still in progress"
        return [f"Your fact {f.label} is {state}; this line describes it as finished."]
    return []
