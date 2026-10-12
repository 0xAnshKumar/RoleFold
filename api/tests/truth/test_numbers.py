from decimal import Decimal

import pytest

from app.truth.numbers import extract, same


def one(text):
    [q] = extract(text)
    return q


@pytest.mark.parametrize("a,b", [
    ("₹1,50,000", "1.5 lakh"),
    ("1.5 lakh", "150000"),
    ("150,000", "1,50,000"),
    ("12 LPA", "₹12,00,000"),
    ("12 LPA", "12 lakh"),
    ("2.5 crore", "2,50,00,000"),
    ("2.5 Cr", "25000000"),
    ("10k", "10,000"),
    ("2M", "20 lakh"),
    ("1.8 MB", "1800 KB"),
    ("4.2s", "4200 ms"),
    ("35%", "35 percent"),
    ("3 years", "36 months"),
    ("Rs.1,20,000", "1.2 lakh"),
])
def test_equal_quantities(a, b):
    assert same(one(a), one(b))


@pytest.mark.parametrize("a,b", [
    ("30%", "40%"),
    ("30%", "30"),
    ("640 KB", "640 MB"),
    ("$2M", "₹2M"),
    ("4.2s", "4.2 min"),
])
def test_different_quantities(a, b):
    assert not same(one(a), one(b))


def test_values_and_units():
    q = one("₹1,50,000")
    assert (q.value, q.dim, q.currency, q.raw) == (Decimal(150000), "", "INR", "₹1,50,000")
    assert one("12 LPA").currency == "INR"
    assert one("640 KB").dim == "bytes"


def test_versions_and_identifiers_are_not_split():
    assert [q.raw for q in extract("Python 3.11 on S3 and EC2, v2.0")] == ["3.11"]


def test_suffix_needs_word_boundary():
    assert [q.raw for q in extract("10 bugs in 5 sprints")] == ["10", "5"]
