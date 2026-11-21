from types import SimpleNamespace as V

from app.routes.profile import skill_evidence


def test_skill_evidence_counts_tools_and_whole_words_in_text():
    rows = [
        V(tools=[], description="Covered a FastAPI backend with 273 tests, shipped in Docker."),
        V(tools=[{"raw": "Go"}], description="Built a CLI."),
        V(tools=[], description="Moved the app to React Native."),
    ]
    assert skill_evidence("FastAPI", rows) == 1
    assert skill_evidence("docker", rows) == 1
    assert skill_evidence("Go", rows) == 1  # from tools; "Go" isn't matched inside other words
    assert skill_evidence("Java", rows) == 0
    assert skill_evidence("React Native", rows) == 1
    assert skill_evidence("C", rows) == 0  # not matched inside "CLI"
