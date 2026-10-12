import pytest

from app.llm.gateway import FakeLLM, Gateway, Tier

MODELS = {Tier.FAST: "fast-model", Tier.WRITER: "writer-model", Tier.VERIFIER: "verifier-model"}


@pytest.fixture(autouse=True)
def no_live_llm(request, monkeypatch):
    """Task handlers never build the real gateway in tests: an empty FakeLLM fails any unscripted call.
    Only tests marked `live` (tests/live, opt-in via RUN_LIVE_LLM=1) are exempt."""
    if request.node.get_closest_marker("live"):
        return
    from app.tasks import llm

    monkeypatch.setattr(llm, "GATEWAY", Gateway(FakeLLM([]), MODELS, sleep=lambda s: None))
