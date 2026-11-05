"""Deterministic pre-redaction before any model call (CEO D12, invariant I-10).

Replaces emails, phone numbers, URLs, address-like lines and the user's name(s) with
placeholders such as ⟦EMAIL_1⟧. `restore` puts the original values back into model output.
Callers pass every name they know: the parsed import header name and the stored users.name
(`app.tasks.match.user_names`). Each name is redacted as the full name and as each of its tokens of
3+ characters (so "Priya" or "Sharma" alone are caught), case-insensitive, whole word.

Residual limitation (documented, accepted in D12): only the names passed in are redacted. Other
people's names, and the user's name written differently (nickname, initials, a token under 3
characters, another script or spelling), are not detected and can reach the model. Address detection is limited to
lines labelled "Address:" and, only for a whole resume (`header=True`, the import task), the header block: the first
HEADER_LINES lines up to the first section heading. Single facts and job quotes have no header, so "Led phase 2 of
the main checkout" is never taken for an address; a street name inside an experience bullet is not redacted either.
"""

import re
from dataclasses import dataclass, field

HEADER_LINES = 8
# A section heading ends the header block ("Experience", "## Skills", "Work Experience:").
_SECTION_RE = re.compile(
    r"^\s*#*\s*(?:summary|profile|objective|about(?: me)?|(?:work |professional )?experience|employment(?: history)?"
    r"|education|(?:technical )?skills|projects|certifications?|achievements|publications)\s*:?\s*$",
    re.IGNORECASE,
)
# Any redaction placeholder; one left in model output after restore() is unknown (invented or mangled).
PLACEHOLDER_RE = re.compile(r"⟦[^⟧]*⟧")

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
URL_RE = re.compile(
    r"(?:https?://|www\.)\S+"
    # Bare domains are lowercase-only so "ASP.NET" or "Socket.IO" stay as skills.
    r"|(?-i:\b(?:[a-z0-9-]+\.)+(?:com|in|org|net|co|me)\b(?:/\S*)?)",
    re.IGNORECASE,
)
# A run of digits with phone separators; accepted only when it holds 10-13 digits (see _is_phone).
_PHONE_CANDIDATE_RE = re.compile(r"(?<!\w)\+?\(?\d[\d\s().-]{7,}\d(?!\w)")
_ADDRESS_LABEL_RE = re.compile(r"^\s*(?:address|addr\.?|residence)\s*[:\-]", re.IGNORECASE)
_ADDRESS_WORDS_RE = re.compile(
    r"\b(?:road|rd|street|st|lane|marg|nagar|colony|layout|sector|block|flat|apartment|apt"
    r"|floor|house|h\.?\s?no|phase|cross|main|society|chowk|pin(?:code)?)\b",
    re.IGNORECASE,
)
# Indian PIN code ending a line ("Bengaluru 560038"); mid-line 6-digit numbers are usually amounts.
_PIN_RE = re.compile(r"(?<![\d,.])\d{3}\s?\d{3}\s*$")


def _is_phone(s: str) -> bool:
    digits = sum(c.isdigit() for c in s)
    return 10 <= digits <= 13


@dataclass
class Redaction:
    text: str
    mapping: dict[str, str] = field(default_factory=dict)  # placeholder -> original


class _Redactor:
    def __init__(self, mapping: dict[str, str] | None = None) -> None:
        # A shared mapping keeps placeholders unique across several texts (extended in place).
        self.mapping: dict[str, str] = {} if mapping is None else mapping
        self._by_value: dict[tuple[str, str], str] = {}
        self._counts: dict[str, int] = {}
        for ph, value in self.mapping.items():
            kind, n = ph[1:-1].rsplit("_", 1)
            self._by_value[(kind, value)] = ph
            self._counts[kind] = max(self._counts.get(kind, 0), int(n))

    def placeholder(self, kind: str, value: str) -> str:
        key = (kind, value)
        if key not in self._by_value:
            self._counts[kind] = self._counts.get(kind, 0) + 1
            ph = f"⟦{kind}_{self._counts[kind]}⟧"
            self._by_value[key] = ph
            self.mapping[ph] = value
        return self._by_value[key]

    def sub(self, pattern: re.Pattern, kind: str, text: str, accept=lambda s: True) -> str:
        def repl(m: re.Match) -> str:
            value = m.group(0).rstrip(".,;)")
            if not accept(value):
                return m.group(0)
            return self.placeholder(kind, value) + m.group(0)[len(value) :]

        return pattern.sub(repl, text)


def _is_address(line: str, in_header: bool) -> bool:
    if _ADDRESS_LABEL_RE.search(line):
        return True
    if not in_header:
        return False
    return bool(_PIN_RE.search(line) or (_ADDRESS_WORDS_RE.search(line) and re.search(r"\d", line)))


def redact(text: str, names: list[str] | tuple[str, ...] = (), *, header: bool = False,
           mapping: dict[str, str] | None = None) -> Redaction:
    """Redact contact details and the given name(s): the header name and/or the stored users.name.

    `header`: text is a whole resume whose first lines are a contact header (address heuristics apply there).
    `mapping`: an earlier redaction's mapping to extend, so one restore() works across several texts."""
    r = _Redactor(mapping)
    text = r.sub(EMAIL_RE, "EMAIL", text)
    text = r.sub(URL_RE, "URL", text)
    text = r.sub(_PHONE_CANDIDATE_RE, "PHONE", text, _is_phone)

    lines = text.split("\n")
    in_header = header
    for i, line in enumerate(lines):
        in_header = in_header and i < HEADER_LINES and not _SECTION_RE.match(line)
        if line.strip() and _is_address(line, in_header):
            lines[i] = r.placeholder("ADDRESS", line.strip())
    text = "\n".join(lines)

    for name in names:
        name = name.strip()
        if not name:
            continue
        # Full name first, then each token, so "Priya" alone is also caught.
        for part in [name, *name.split()]:
            if len(part) < 3:
                continue
            pattern = re.compile(rf"(?<!\w){re.escape(part)}(?!\w)", re.IGNORECASE)
            text = pattern.sub(lambda m: r.placeholder("NAME", m.group(0)), text)
    return Redaction(text, r.mapping)


def restore(value, mapping: dict[str, str]):
    """Put original values back into a string, or into lists/dicts of strings (model output)."""
    if isinstance(value, str):
        for ph, original in mapping.items():
            value = value.replace(ph, original)
        return value
    if isinstance(value, list):
        return [restore(v, mapping) for v in value]
    if isinstance(value, dict):
        return {k: restore(v, mapping) for k, v in value.items()}
    return value


_UUID_RE = re.compile(r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b", re.IGNORECASE)


def find_pii(text: str) -> list[str]:
    """Contact details still present in text. The gateway refuses to send text where this is non-empty."""
    found = EMAIL_RE.findall(text) + URL_RE.findall(text)
    text = _UUID_RE.sub(" ", text)  # record ids are not phone numbers
    found += [m.group(0) for m in _PHONE_CANDIDATE_RE.finditer(text) if _is_phone(m.group(0))]
    return found
