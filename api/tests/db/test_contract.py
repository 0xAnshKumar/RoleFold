"""Routes the frontend builds against: uploads, /me, preferences and goals, job status, confirmed gaps, export.

FakeLLM only; exports must not call it at all.
"""

import io

import docx
import pypdf
import pytest
import typst
from sqlalchemy import text

from app.core.config import get_settings
from app.tasks.worker import run_once
from tests.db.test_pipeline import JOB, confirmed_fact, count, fake, paste, task_row

pytestmark = pytest.mark.db

RESUME = """Rohan Iyer
Frontend Engineer, Northwind Commerce (Jul 2021 – Present)
- Led the checkout migration, cutting the bundle from 1.8 MB to 640 KB
Projects
Datepick: built a date picker used by 3 teams
"""
EXTRACT = {
    "experiences": [{"employer": "Northwind Commerce", "title": "Frontend Engineer", "start": "2021-07",
                     "source_span": "Frontend Engineer",
                     "facts": [{"description": "Led the checkout migration, cutting the bundle from 1.8 MB to 640 KB",
                                "source_verb": "Led", "source_span": "Led the checkout migration"}]}],
    "projects": [{"title": "Datepick", "source_span": "Datepick",
                  "facts": [{"description": "Built a date picker used by 3 teams", "source_verb": "Built",
                             "source_span": "built a date picker"}]}],
}


def pdf_bytes(body: str) -> bytes:
    return typst.compile(body.encode(), format="pdf")


def docx_bytes(body: str) -> bytes:
    d = docx.Document()
    for line in body.splitlines():
        d.add_paragraph(line)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def upload(api, name, data, ctype="application/octet-stream"):
    return api.write("POST", "/v1/imports", files={"file": (name, data, ctype)})


# ---------------------------------------------------------------- imports


@pytest.mark.parametrize("name,make", [("cv.pdf", pdf_bytes), ("cv.docx", docx_bytes), ("cv.md", str.encode)])
def test_upload_extracts_text_and_stores_the_original(pg, alice, name, make):
    data = make("Frontend Engineer at Northwind Commerce\nLed the checkout migration")
    r = upload(alice, name, data)
    assert r.status_code == 202, r.json()
    imp = r.json()["import"]
    assert imp["source_file_key"].startswith(f"{alice.id}/imports/")
    assert (get_settings().storage_dir / imp["source_file_key"]).read_bytes() == data
    assert imp["size_bytes"] == len(data) and imp["filename"] == name
    assert "Led the checkout migration" in task_row(pg, "import")[4]["text"]


def test_upload_rejects_mismatch_scans_and_size(pg, alice, monkeypatch):
    assert upload(alice, "cv.pdf", b"just text").json()["error"]["code"] == "UNSUPPORTED_FORMAT"
    assert upload(alice, "cv.docx", pdf_bytes("hi")).status_code == 415
    assert upload(alice, "cv.exe", b"MZ").status_code == 415
    blank = upload(alice, "scan.pdf", pdf_bytes("#box(width: 1cm, height: 1cm, fill: black)"))
    assert blank.status_code == 422 and blank.json()["error"]["code"] == "NO_EXTRACTABLE_TEXT"
    monkeypatch.setenv("UPLOAD_MAX_MB", "0")
    get_settings.cache_clear()
    try:
        assert upload(alice, "cv.txt", b"hello").status_code == 413
    finally:
        monkeypatch.delenv("UPLOAD_MAX_MB")
        get_settings.cache_clear()
    assert count(pg, "SELECT count(*) FROM imports") == 0


def test_upload_page_and_length_limits(pg, alice, monkeypatch):
    r = upload(alice, "long.pdf", pdf_bytes("one" + "#pagebreak() more" * 10))
    assert r.status_code == 413 and r.json()["error"]["details"] == {"max_pages": 10, "pages": 11}
    monkeypatch.setenv("UPLOAD_MAX_CHARS", "10")
    get_settings.cache_clear()
    try:
        r = upload(alice, "cv.docx", docx_bytes("Frontend Engineer at Northwind"))
        assert r.status_code == 413 and r.json()["error"]["code"] == "FILE_TOO_LARGE"
    finally:
        monkeypatch.delenv("UPLOAD_MAX_CHARS")
        get_settings.cache_clear()
    assert count(pg, "SELECT count(*) FROM imports") == 0


def test_failed_upload_request_leaves_no_file(pg, alice, monkeypatch):
    from app.core.errors import ApiError
    from app.routes import imports

    def boom(*a, **k):
        raise ApiError(503, "DEPENDENCY_UNAVAILABLE", "queue down")

    monkeypatch.setattr(imports, "enqueue", boom)
    assert upload(alice, "cv.md", b"Frontend Engineer").status_code == 503
    assert count(pg, "SELECT count(*) FROM imports") == 0
    assert not list((get_settings().storage_dir / str(alice.id)).rglob("original.*"))


def test_project_drafts_are_grouped(pg, alice, monkeypatch):
    fake(monkeypatch, [EXTRACT])
    upload(alice, "cv.txt", RESUME.encode())
    assert run_once(pg.worker) and task_row(pg, "import")[0] == "succeeded"
    groups = alice.get("/v1/profile").json()["draftGroups"]
    assert [(g["kind"], g["role"]) for g in groups] == [("experience", "Frontend Engineer · Northwind Commerce"),
                                                        ("project", "Datepick")]
    assert groups[1]["projectId"] and groups[1]["drafts"][0]["numbers"] == ["3"]


# ---------------------------------------------------------------- me, preferences, goals

PREFS = {"locations": ["Bengaluru"], "modes": ["Hybrid", "Remote"], "type": "Full-time", "visa": "Not needed",
         "notice": "2 months"}
GOALS = {"roles": ["Senior Frontend Engineer"], "industries": ["Fintech"], "seniority": "Senior"}


def test_me_preferences_and_goals_feed_the_profile(pg, alice):
    assert alice.get("/v1/preferences").json() == {"locations": [], "modes": [], "type": "", "visa": "", "notice": ""}
    me = alice.write("PATCH", "/v1/me", {"name": "Rohan Iyer", "headline": "Frontend engineer", "location": "Bengaluru"})
    assert (me.json()["name"], me.json()["headline"], me.json()["location"]) == ("Rohan Iyer", "Frontend engineer",
                                                                                  "Bengaluru")
    assert alice.write("PUT", "/v1/preferences", PREFS).json() == PREFS
    assert alice.write("PUT", "/v1/preferences", {**PREFS, "notice": "30 days"}).status_code == 200
    assert alice.write("PUT", "/v1/goals", GOALS).json() == GOALS
    assert alice.write("PUT", "/v1/goals", {"roles": []}).status_code == 422
    prof = alice.get("/v1/profile").json()
    assert (prof["name"], prof["headline"], prof["location"]) == ("Rohan Iyer", "Frontend engineer", "Bengaluru")
    assert prof["prefs"] == {**PREFS, "notice": "30 days"} and prof["goals"] == GOALS
    with pg.superuser.connect() as c:
        assert c.execute(text("SELECT version, notice_period_days, employment_types, visa_needs FROM preference_versions "
                              "ORDER BY version")).all() == [(1, 60, ["Full-time"], []), (2, 30, ["Full-time"], [])]
        assert c.scalar(text("SELECT target_occupations FROM career_goals")) == ["Senior Frontend Engineer"]


# ---------------------------------------------------------------- jobs


def matched_job(pg, api, monkeypatch):
    fv = confirmed_fact(api, "Led the checkout migration to React", 3)["fact_version_id"]
    fake(monkeypatch, [JOB, {"results": [
        {"requirement_id": "R1", "support": "supported", "cited_fact_version_ids": [fv], "reason": "React."}]}])
    job_id = paste(api)
    assert run_once(pg.worker)
    return job_id


def test_job_status_and_user_confirmed_gaps(pg, alice, bob, monkeypatch):
    job_id = matched_job(pg, alice, monkeypatch)
    item = alice.write("PATCH", f"/v1/jobs/{job_id}", {"status": "applied"}).json()
    assert item["id"] == job_id and item["status"] == "applied"
    assert alice.write("PATCH", f"/v1/jobs/{job_id}", {"status": "not_interested"}).json()["status"] == "not_interested"
    assert alice.write("PATCH", f"/v1/jobs/{job_id}", {"status": "maybe"}).status_code == 422

    reqs = {r["text"]: r for r in alice.get(f"/v1/jobs/{job_id}/match").json()["requirements"]}
    rust = reqs["Rust"]
    assert rust["status"] == "no_evidence"
    path = f"/v1/jobs/{job_id}/requirements/{rust['id']}/gap"
    m = alice.write("POST", path, {"confirmed": True}).json()
    assert {r["text"]: r["status"] for r in m["requirements"]}["Rust"] == "gap" and m["verdict"]
    assert alice.write("POST", path, {"confirmed": True}).status_code == 200  # no duplicate assertion
    assert count(pg, "SELECT count(*) FROM skill_assertions WHERE withdrawn_at IS NULL") == 1
    m = alice.write("POST", path, {"confirmed": False}).json()
    assert {r["text"]: r["status"] for r in m["requirements"]}["Rust"] == "no_evidence"
    assert bob.write("POST", path, {"confirmed": True}).status_code == 404
    assert bob.write("PATCH", f"/v1/jobs/{job_id}", {"status": "saved"}).status_code == 404


# ---------------------------------------------------------------- export


def master_resume(pg, api, monkeypatch) -> str:
    fv = confirmed_fact(api, "Led the checkout migration to React", 3)["fact_version_id"]
    fake(monkeypatch, [
        {"statements": [{"type": "candidate_fact", "text": "Led the checkout migration to React.",
                         "cited_fact_version_ids": [fv]}]},
        {"results": [{"statement_index": 0, "supported": True}]},
    ])
    rid = api.write("POST", "/v1/resumes", {"template": "classic", "target": "Frontend roles"}).json()["resume_id"]
    assert run_once(pg.worker) and task_row(pg, "tailor")[0] == "succeeded"
    return rid


def export(pg, api, rid, fmt, template):
    r = api.write("POST", f"/v1/resumes/{rid}/export", {"format": fmt, "template": template})
    assert r.status_code == 202 and set(r.json()) == {"operation"}
    op = r.json()["operation"]
    assert op["type"] == "render" and op["basis"]["template_id"] == template
    assert run_once(pg.worker)
    op = api.get(f"/v1/tasks/{op['id']}").json()
    assert op["state"] == "succeeded", op
    return op["result"]["export_id"]


def test_export_renders_without_limits_or_models(pg, alice, bob, monkeypatch):
    rid = master_resume(pg, alice, monkeypatch)
    alice.write("PATCH", "/v1/me", {"name": "Rohan Iyer", "location": "Bengaluru"})
    calls, usage = count(pg, "SELECT count(*) FROM llm_calls"), alice.get("/v1/usage").json()["metrics"]
    with pg.superuser.begin() as c:  # spend cap reached: exports still work (I-12)
        c.execute(text("INSERT INTO llm_calls (id, purpose, model, cost) VALUES (gen_random_uuid(), 'x', 'm', 99)"))
    fake(monkeypatch, [])  # any model call would fail the task

    pdf_id = export(pg, alice, rid, "pdf", "tech")
    r = alice.get(f"/v1/exports/{pdf_id}/download")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"] == 'attachment; filename="Rohan-Iyer-Resume.pdf"'
    pdf_text = " ".join(pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text().split())
    assert pdf_text.startswith("Rohan Iyer") and "Bengaluru" in pdf_text
    assert "Led the checkout migration to React." in pdf_text and "Experience" in pdf_text

    # An edit is snapshotted into a new immutable version before rendering.
    alice.write("PATCH", f"/v1/resumes/{rid}/statements/s1", {"text": "Led the checkout migration to React", "version": 1})
    docx_id = export(pg, alice, rid, "docx", "modern")
    r = alice.get(f"/v1/exports/{docx_id}/download")
    assert r.headers["content-disposition"].endswith('Rohan-Iyer-Resume.docx"')
    paras = [p.text for p in docx.Document(io.BytesIO(r.content)).paragraphs]
    assert paras[0] == "Rohan Iyer" and "Led the checkout migration to React" in paras

    with pg.superuser.connect() as c:
        rows = c.execute(text("SELECT e.format, v.version, e.basis->>'resume_version_id' = v.id::text, "
                              "e.basis->>'renderer' FROM resume_exports e JOIN resume_versions v "
                              "ON v.id = e.resume_version_id ORDER BY v.version")).all()
    assert rows == [("pdf", 1, True, "render-1"), ("docx", 2, True, "render-1")]
    assert count(pg, "SELECT count(*) FROM llm_calls") == calls + 1  # only the cap row inserted above
    assert alice.get("/v1/usage").json()["metrics"] == usage
    assert bob.get(f"/v1/exports/{pdf_id}/download").status_code == 404
    assert alice.write("POST", f"/v1/resumes/{rid}/export", {"format": "txt", "template": "tech"}).status_code == 422
