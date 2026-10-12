import pytest

from app.truth.url_paste import is_url_only


@pytest.mark.parametrize("text", [
    "https://www.linkedin.com/jobs/view/123",
    "  www.naukri.com/job-listings-abc  ",
    "linkedin.com/jobs/view/123",
    "https://a.com/x https://b.in/y.",
])
def test_url_only(text):
    assert is_url_only(text)


@pytest.mark.parametrize("text", [
    "",
    "   ",
    "Senior Engineer at Acme. Apply at https://acme.com/jobs",
    "We need 5+ years of Python. Must know ASP.NET.",
])
def test_not_url_only(text):
    assert not is_url_only(text)
