import os

import pytest

# Tests sign in with X-Dev-User and keep exercising tailoring, which are both off by default.
os.environ["DEV_AUTH"] = "1"
os.environ["TAILORING_ENABLED"] = "1"

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
