from datetime import date

from app.truth.checks import FactVersion, Statement, check_statement, passed

F12 = FactVersion("fv-12", "F-12", "Reduced processing time by 30% using Python", 2, employer="Infosys",
                  title="Senior Engineer", start=date(2019, 1, 1), end=date(2022, 3, 1), tools=("python",))
F15 = FactVersion("fv-15", "F-15", "Contributed to the payments migration to Kafka", 1, employer="Infosys",
                  title="Senior Engineer", start=date(2019, 1, 1), end=date(2022, 3, 1), tools=("kafka",))
F20 = FactVersion("fv-20", "F-20", "Migrating billing to Postgres", 2, completion="in_progress",
                  employer="TCS", title="Tech Lead", start=date(2022, 4, 1), tools=("postgres",))
FACTS = {f.id: f for f in (F12, F15, F20)}
ALIASES = {"python": "python", "kafka": "kafka", "postgres": "postgresql", "postgresql": "postgresql",
           "react": "react", "react native": "react-native"}


def run(text, *cited, type="candidate_fact"):
    return check_statement(Statement(type, text, tuple(cited)), FACTS, ALIASES, as_of=date(2024, 10, 1))


def failed(results):
    return {r.check: r.reasons for r in results if not r.passed}


def test_faithful_statement_passes():
    assert passed(run("Reduced processing time by 30% with Python", "fv-12"))


def test_A02_changed_number_is_blocked_with_reason_and_source_fact():
    fails = failed(run("Reduced processing time by 40% with Python", "fv-12"))
    assert list(fails) == ["numbers"]
    expected = '"40%" isn\'t in your fact F-12 (it says: "Reduced processing time by 30% using Python").'
    assert fails["numbers"] == (expected,)


def test_A03_contributed_written_as_led_is_blocked():
    fails = failed(run("Led the payments migration to Kafka", "fv-15"))
    assert fails == {"responsibility": ('Your fact F-15 says you contributed; "Led" claims more.',)}
    assert passed(run("Contributed to the payments migration to Kafka", "fv-15"))


def test_citation_required_and_must_be_current():
    assert failed(run("Reduced processing time", type="summary"))["citation"]
    assert failed(run("Reduced processing time", "fv-old"))["citation"]
    assert "citation" not in failed(run("Across roles:", type="connective"))


def test_duration_from_dates_is_the_only_derivation():
    assert passed(run("Over 3 years at Infosys, contributed to the Kafka migration", "fv-15"))
    assert passed(run("Contributed for 38 months to the Kafka migration", "fv-15"))
    assert failed(run("Over 4 years at Infosys, contributed to the Kafka migration", "fv-15"))["numbers"]


def test_indian_number_formats_match():
    fact = FactVersion("fv-1", "F-1", "Closed deals worth ₹1,50,000 per month", 2)
    stmt = Statement("candidate_fact", "Closed deals worth 1.5 lakh per month", ("fv-1",))
    assert passed(check_statement(stmt, {"fv-1": fact}))


def test_dates_employers_titles_must_match_cited_fact():
    assert failed(run("Reduced processing time by 30% at TCS", "fv-12"))["employer_title"]
    assert failed(run("As Tech Lead, reduced processing time by 30%", "fv-12"))["employer_title"]
    assert failed(run("Since Jun 2019, reduced processing time by 30%", "fv-12"))["dates"]
    assert passed(run("Since Jan 2019, reduced processing time by 30%", "fv-12"))


def test_named_tools_must_be_in_cited_facts():
    assert failed(run("Reduced processing time by 30% with Python and Postgres", "fv-12"))["tools"] == (
        '"Postgres" isn\'t listed in your fact F-12.',)
    native = FactVersion("fv-n", "F-N", "Built the app", 2, tools=("React Native",))
    stmt = Statement("candidate_fact", "Built the app in React Native", ("fv-n",))
    assert passed(check_statement(stmt, {"fv-n": native}, ALIASES))
    stmt = Statement("candidate_fact", "Built the app in React", ("fv-n",))
    assert not passed(check_statement(stmt, {"fv-n": native}, ALIASES))


def test_in_progress_never_written_as_completed():
    fails = failed(run("Migrated billing to Postgres", "fv-20"))
    assert fails["completion"] == ("Your fact F-20 is still in progress; this line describes it as finished.",)
    assert passed(run("Migrating billing to Postgres", "fv-20"))
    assert passed(run("Currently moving billing to Postgres", "fv-20"))


def test_connective_with_claims_is_blocked():
    assert failed(run("Led 3 teams", type="connective"))


def test_summary_may_only_name_skills_and_numbers_from_the_facts_it_cites():
    # The summary cites F-12 (Python) but also draws on F-15 (Kafka): blocked, even without an alias table.
    results = check_statement(Statement("summary", "Engineer who uses Python and Kafka", ("fv-12",)), FACTS)
    assert failed(results) == {"tools": ('"Kafka" isn\'t in your fact F-12.',)}
    # A declared skill no cited fact mentions is also blocked.
    results = check_statement(Statement("summary", "Python engineer who knows GraphQL", ("fv-12",)), FACTS,
                              terms=["GraphQL"])
    assert failed(results) == {"tools": ('"GraphQL" isn\'t in your fact F-12.',)}
    # A number from another fact is blocked (the numbers check, cited facts only).
    results = check_statement(Statement("summary", "Python engineer; cut processing time by 30% and 45%",
                                        ("fv-12",)), FACTS)
    assert list(failed(results)) == ["numbers"]
    # Citing both facts makes the same line pass; bullets keep the alias-only tool check.
    assert passed(check_statement(Statement("summary", "Engineer who uses Python and Kafka", ("fv-12", "fv-15")),
                                  FACTS))
    assert passed(check_statement(Statement("candidate_fact", "Reduced processing time by 30% using Kafka",
                                            ("fv-12",)), FACTS))
