import re

from app.truth.redact import find_pii, redact, restore

RESUME = """Priya Sharma
priya.sharma@gmail.com | +91 98765 43210 | +91-98765-43210 | 098765 43210
Alt: 9876543210, 080-2345 6789, (080) 2345 6789
Flat 12, 4th Cross, Indiranagar, Bengaluru 560038
https://linkedin.com/in/priya-sharma  github.com/priyasharma  www.priya.dev
Address: 22 Park Street, Kolkata

Experience
Senior Engineer, Infosys, Jan 2019 - Mar 2022
- Built ASP.NET and Socket.IO services for 1,50,000 users; cut latency by 35%.
- Priya mentored 4 interns. Contact priya@infosys.com for references.
"""

EMAIL = re.compile(r"\S+@\S+")
PHONE_DIGITS = re.compile(r"\d[\d\s().-]{8,}\d")


def test_no_email_phone_url_or_name_survives():
    r = redact(RESUME, ["Priya Sharma"], header=True)
    assert not EMAIL.search(r.text)
    assert not [m for m in PHONE_DIGITS.findall(r.text) if sum(c.isdigit() for c in m) >= 10]
    assert "linkedin" not in r.text and "github" not in r.text and "priya.dev" not in r.text
    assert "Priya" not in r.text and "Sharma" not in r.text
    assert "560038" not in r.text and "Park Street" not in r.text
    assert find_pii(r.text) == []


def test_facts_numbers_and_tools_are_kept():
    r = redact(RESUME, ["Priya Sharma"], header=True)
    for kept in ["ASP.NET", "Socket.IO", "1,50,000", "35%", "Jan 2019 - Mar 2022", "Infosys"]:
        assert kept in r.text


def test_placeholders_and_restore_round_trip():
    r = redact(RESUME, ["Priya Sharma"], header=True)
    assert "⟦EMAIL_1⟧" in r.text and r.mapping["⟦EMAIL_1⟧"] == "priya.sharma@gmail.com"
    assert restore(r.text, r.mapping) == RESUME
    nested = {"employer": "x", "facts": [{"description": "⟦NAME_2⟧ mentored 4 interns"}]}
    assert restore(nested, r.mapping)["facts"][0]["description"].startswith("Priya")


def test_same_value_reuses_placeholder():
    r = redact("a@b.com then a@b.com")
    assert r.text == "⟦EMAIL_1⟧ then ⟦EMAIL_1⟧"


def test_dates_and_amounts_are_not_phones():
    text = "2019 - 2021, revenue ₹2,50,00,000, 150000 users"
    assert redact(text).text == text


def test_residual_limitation_mid_text_other_names_not_redacted():
    # Documented in redact.py: only the given header name is redacted.
    assert "Rahul" in redact("Worked with Rahul Verma", ["Priya Sharma"]).text


def test_name_variants_case_insensitive_whole_word_tokens_of_three_plus():
    t = redact("PRIYA K SHARMA led it; priya and sharma reviewed; Priyanka helped; K approved", ["Priya K Sharma"]).text
    assert "priya" not in t.lower().replace("priyanka", "") and "sharma" not in t.lower()
    assert "Priyanka" in t and " K approved" in t  # whole words only; tokens under 3 chars are kept


def test_single_fact_is_never_an_address():
    # Regression (HANDOFF §8.2): address words + a digit in a one-line fact used to become ⟦ADDRESS_1⟧.
    for fact in ["Led phase 2 of the main checkout rewrite, cutting load time 40%",
                 "Moved 3 teams onto one floor plan for block storage", "Shipped release 560038"]:
        assert redact(fact).text == fact
    assert redact("Address: 22 Park Street, Kolkata").text == "⟦ADDRESS_1⟧"  # the label rule applies everywhere


def test_header_block_ends_at_first_section_heading():
    text = "Priya Sharma\nFlat 12, 4th Cross, Bengaluru 560038\nSummary\nLed phase 2 of the main checkout"
    out = redact(text, header=True).text
    assert "⟦ADDRESS_1⟧" in out and "560038" not in out
    assert out.endswith("Summary\nLed phase 2 of the main checkout")


def test_shared_mapping_keeps_placeholders_unique_across_texts():
    mapping: dict[str, str] = {}
    a = redact("Mail a@x.com", mapping=mapping)
    b = redact("Mail b@y.com or a@x.com, by Priya", ["Priya"], mapping=mapping)
    assert a.text == "Mail ⟦EMAIL_1⟧" and b.text == "Mail ⟦EMAIL_2⟧ or ⟦EMAIL_1⟧, by ⟦NAME_1⟧"
    assert mapping == {"⟦EMAIL_1⟧": "a@x.com", "⟦EMAIL_2⟧": "b@y.com", "⟦NAME_1⟧": "Priya"}
