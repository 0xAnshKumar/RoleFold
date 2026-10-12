"""Extract and normalize quantities so equal amounts compare equal (CEO D23).

₹1,50,000 == 1.5 lakh == 150000; 12 LPA == ₹12,00,000; 1.8 MB == 1800 KB; 4.2s == 4200 ms.
Commas are stripped, so Indian (1,50,000) and Western (150,000) grouping both work.

Limits: numbers written as words ("thirty percent") are not extracted; byte units are decimal
(1 KB = 1000 B); a bare "B" means billion, never bytes.
"""

import re
from dataclasses import dataclass
from decimal import Decimal

# suffix -> (multiplier, dimension). Dimension "" is a plain count or amount of money.
_SUFFIXES: dict[str, tuple[Decimal, str]] = {
    "%": (Decimal(1), "%"),
    "percent": (Decimal(1), "%"),
    "per cent": (Decimal(1), "%"),
    "k": (Decimal(10) ** 3, ""),
    "thousand": (Decimal(10) ** 3, ""),
    "m": (Decimal(10) ** 6, ""),
    "mn": (Decimal(10) ** 6, ""),
    "million": (Decimal(10) ** 6, ""),
    "b": (Decimal(10) ** 9, ""),
    "bn": (Decimal(10) ** 9, ""),
    "billion": (Decimal(10) ** 9, ""),
    "l": (Decimal(10) ** 5, ""),
    "lac": (Decimal(10) ** 5, ""),
    "lacs": (Decimal(10) ** 5, ""),
    "lakh": (Decimal(10) ** 5, ""),
    "lakhs": (Decimal(10) ** 5, ""),
    "lpa": (Decimal(10) ** 5, ""),
    "cr": (Decimal(10) ** 7, ""),
    "crore": (Decimal(10) ** 7, ""),
    "crores": (Decimal(10) ** 7, ""),
    "kb": (Decimal(10) ** 3, "bytes"),
    "mb": (Decimal(10) ** 6, "bytes"),
    "gb": (Decimal(10) ** 9, "bytes"),
    "tb": (Decimal(10) ** 12, "bytes"),
    "ms": (Decimal("0.001"), "seconds"),
    "s": (Decimal(1), "seconds"),
    "sec": (Decimal(1), "seconds"),
    "secs": (Decimal(1), "seconds"),
    "second": (Decimal(1), "seconds"),
    "seconds": (Decimal(1), "seconds"),
    "min": (Decimal(60), "seconds"),
    "mins": (Decimal(60), "seconds"),
    "minute": (Decimal(60), "seconds"),
    "minutes": (Decimal(60), "seconds"),
    "hr": (Decimal(3600), "seconds"),
    "hrs": (Decimal(3600), "seconds"),
    "hour": (Decimal(3600), "seconds"),
    "hours": (Decimal(3600), "seconds"),
    "day": (Decimal(86400), "seconds"),
    "days": (Decimal(86400), "seconds"),
    "week": (Decimal(604800), "seconds"),
    "weeks": (Decimal(604800), "seconds"),
    "month": (Decimal(1), "months"),
    "months": (Decimal(1), "months"),
    "year": (Decimal(12), "months"),
    "years": (Decimal(12), "months"),
    "yr": (Decimal(12), "months"),
    "yrs": (Decimal(12), "months"),
    "x": (Decimal(1), "x"),
}
_CURRENCIES = {"₹": "INR", "rs": "INR", "rs.": "INR", "inr": "INR", "$": "USD", "usd": "USD"}

_suffix_alt = "|".join(re.escape(s) for s in sorted(_SUFFIXES, key=len, reverse=True))
_NUMBER_RE = re.compile(
    r"(?P<cur>₹|\bRs\.?|\bINR|\$|\bUSD)?\s*"
    r"(?<!\w)(?<!\d\.)(?P<num>\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    rf"(?:\s*(?P<suf>{_suffix_alt})(?![A-Za-z]))?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Quantity:
    value: Decimal  # normalized: base unit of its dimension
    dim: str  # "", "%", "bytes", "seconds", "months", "x"
    currency: str | None  # "INR", "USD" or None when not stated
    raw: str  # exactly as written


def extract(text: str) -> list[Quantity]:
    out = []
    for m in _NUMBER_RE.finditer(text):
        value = Decimal(m.group("num").replace(",", ""))
        suf = (m.group("suf") or "").lower()
        mult, dim = _SUFFIXES.get(suf, (Decimal(1), ""))
        currency = _CURRENCIES.get((m.group("cur") or "").lower())
        if suf == "lpa":
            currency = "INR"
        out.append(Quantity((value * mult).normalize(), dim, currency, m.group(0).strip()))
    return out


def same(a: Quantity, b: Quantity) -> bool:
    """Equal value and dimension; currencies must agree when both are stated."""
    if a.value != b.value or a.dim != b.dim:
        return False
    return a.currency is None or b.currency is None or a.currency == b.currency
