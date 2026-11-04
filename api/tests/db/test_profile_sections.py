"""Achievements, publications, languages, career breaks, projects, guided enrichment, "Update with new facts"
and the export zip. FakeLLM only."""

import io
import json
import zipfile

import pytest
from sqlalchemy import select

from app.db.models import Resume, ResumeDraft, User
from app.routes.resumes import resume_view
from app.tasks.exports import resume_doc
from app.tasks.worker import run_once
from tests.db.conftest import as_user
from tests.db.test_contract import export, master_resume, upload
from tests.db.test_pipeline import confirmed_fact, count, fake, task_row

pytestmark = pytest.mark.db


def doc_of(pg, api, rid):
    with as_user(pg.app, api.id) as db:
        draft = db.scalars(select(ResumeDraft).where(ResumeDraft.resume_id == rid)).one()
        return resume_doc(db, db.get(User, api.id), draft), resume_view(db, db.get(Resume, rid), draft)


def test_achievements_publications_and_breaks_reach_the_resume(pg, alice, monkeypatch):
    rid = master_resume(pg, alice, monkeypatch)  # one role, Northwind (no start date)
    pv = alice.get("/v1/profile").json()["profileVersion"]
    a = alice.write("POST", "/v1/achievements", {"description": "  Speaker, React Bangalore meetup, 2024 "})
    assert a.status_code == 201 and a.json()["status"] == "confirmed" and a.json()["profile_version"] == pv + 1
    alice.write("POST", "/v1/achievements", {"kind": "publication", "description": "Shipping smaller bundles, 2025"})
    assert alice.write("POST", "/v1/achievements", {"kind": "award", "description": "x"}).status_code == 422
    alice.write("POST", "/v1/career-gaps", {"start_month": "2023-02-14", "end_month": "2023-09-01",
                                           "reason_text": " Caregiving ", "show_on_resume": True})
    alice.write("POST", "/v1/career-gaps", {"start_month": "2020-01-01", "show_on_resume": False})
    assert alice.write("POST", "/v1/career-gaps", {"start_month": "2023-02-01", "end_month": "2022-01-01"}).status_code == 422

    p = alice.get("/v1/profile").json()
    assert [(x["kind"], x["text"]) for x in p["achievements"]] == [
        ("achievement", "Speaker, React Bangalore meetup, 2024"), ("publication", "Shipping smaller bundles, 2025")]
    assert [(g["dates"], g["reason"], g["showOnResume"]) for g in p["gaps"]] == [
        ("Feb 2023 – Sep 2023", "Caregiving", True), ("Jan 2020 – Present", "", False)]

    doc, view = doc_of(pg, alice, rid)
    assert doc["sections"]["achievements"]["lines"] == ["Speaker, React Bangalore meetup, 2024"]
    assert doc["sections"]["publications"]["lines"] == ["Shipping smaller bundles, 2025"]
    # The dated break comes before the undated role; the hidden one isn't rendered.
    assert [(e["title"], e["org"]) for e in doc["sections"]["experience"]["entries"]] == [
        ("Career break", "Caregiving"), ("Frontend Engineer", "Northwind Commerce")]
    assert view["extras"]["achievements"] == ["Speaker, React Bangalore meetup, 2024"]
    assert [(s["title"], s.get("org")) for s in view["sections"]] == [
        ("Career break", "Caregiving"), ("Frontend Engineer", "Northwind Commerce")]

    gap = p["gaps"][0]
    assert alice.write("DELETE", f"/v1/career-gaps/{gap['id']}", {"version": 1}).json()["deleted"]
    ach = p["achievements"][0]
    assert alice.write("DELETE", f"/v1/achievements/{ach['id']}", {"version": 2}).status_code == 409
    assert alice.write("DELETE", f"/v1/achievements/{ach['id']}", {"version": ach["version"]}).status_code == 200
    doc, _ = doc_of(pg, alice, rid)
    assert doc["sections"]["achievements"]["lines"] == []
    assert [e["title"] for e in doc["sections"]["experience"]["entries"]] == ["Frontend Engineer"]


def test_imported_languages_are_drafts_until_confirmed(pg, alice, monkeypatch):
    fake(monkeypatch, [{"languages": [{"name": "Hindi", "source_span": "Hindi"},
                                      {"name": "English", "source_span": "English"}]}])
    upload(alice, "cv.txt", b"Rohan Iyer\nLanguages: Hindi, English\n")
    assert run_once(pg.worker) and task_row(pg, "import")[0] == "succeeded"
    langs = sorted(alice.get("/v1/profile").json()["languages"], key=lambda x: x["name"])
    assert [(x["name"], x["status"]) for x in langs] == [("English", "draft"), ("Hindi", "draft")]

    english, hindi = langs
    assert alice.write("POST", f"/v1/languages/{hindi['id']}/confirm", {"version": 1}).json()["status"] == "confirmed"
    assert alice.write("POST", f"/v1/languages/{english['id']}/reject", {"version": 1}).json()["status"] == "rejected"
    added = alice.write("POST", "/v1/languages", {"name": "Kannada", "proficiency": "Conversational"}).json()
    assert added["status"] == "confirmed"
    assert [(x["name"], x["proficiency"], x["status"]) for x in alice.get("/v1/profile").json()["languages"]] == [
        ("Hindi", "", "confirmed"), ("Kannada", "Conversational", "confirmed")]

    # A re-import merges with what's there instead of duplicating it.
    fake(monkeypatch, [{"languages": [{"name": "hindi", "source_span": "Hindi"}]}])
    upload(alice, "cv.txt", b"Rohan Iyer\nLanguages: Hindi\n")
    assert run_once(pg.worker)
    assert count(pg, "SELECT count(*) FROM languages") == 3


def test_draft_fact_under_a_new_project(alice):
    p = alice.write("POST", "/v1/projects", {"name": " Ledgerly "})
    assert p.status_code == 201 and p.json()["name"] == "Ledgerly"
    r = alice.write("POST", "/v1/facts", {"owner_type": "project", "owner_id": p.json()["id"],
                                         "description": "Built a GraphQL API with Apollo Server"})
    assert r.status_code == 201 and r.json()["status"] == "draft"
    prof = alice.get("/v1/profile").json()
    assert [x["name"] for x in prof["projects"]] == ["Ledgerly"]
    assert [(g["kind"], g["role"]) for g in prof["draftGroups"]] == [("project", "Ledgerly")]
    assert prof["projects"][0]["factIds"] == []  # drafts aren't listed; confirmed ones are (the profile shows them)
    alice.write("POST", f"/v1/facts/{r.json()['id']}/confirm", {"version": r.json()["version"], "responsibility_level": 2})
    assert alice.get("/v1/profile").json()["projects"][0]["factIds"] == [r.json()["id"]]
    assert alice.write("POST", "/v1/projects", {"name": ""}).status_code == 422


def test_enrichment_questions_become_draft_facts(alice, bob):
    plain = confirmed_fact(alice, "Led the checkout migration to React", 3)
    confirmed_fact(alice, "Cut the bundle from 1.8 MB to 640 KB", 2)  # has numbers: nothing to ask
    [q] = alice.get("/v1/enrichment-questions").json()["items"]
    assert "Led the checkout migration to React" in q["question"]
    assert len(alice.get("/v1/enrichment-questions").json()["items"]) == 1  # asked once per fact

    assert bob.write("POST", f"/v1/enrichment-questions/{q['id']}/answer", {"answer": "x"}).status_code == 404
    r = alice.write("POST", f"/v1/enrichment-questions/{q['id']}/answer",
                    {"answer": " Checkout conversion rose from 2.1% to 2.6% "})
    assert r.status_code == 201
    f = r.json()
    assert (f["status"], f["origin"], f["description"]) == ("draft", "enrichment", "Checkout conversion rose from 2.1% to 2.6%")
    assert f["experience_id"] == plain["experience_id"]
    assert alice.write("POST", f"/v1/enrichment-questions/{q['id']}/skip").status_code == 409
    assert alice.get("/v1/enrichment-questions").json()["items"] == []  # the answer itself has numbers

    p = alice.get("/v1/profile").json()
    assert p["drafts"] == 1 and p["draftGroups"][0]["drafts"][0]["numbers"] == ["2.1", "2.6"]


def test_update_with_new_facts_makes_the_next_version(pg, alice, bob, monkeypatch):
    rid = master_resume(pg, alice, monkeypatch)
    [fact] = alice.get("/v1/profile").json()["facts"]
    alice.write("PATCH", f"/v1/facts/{fact['id']}", {"version": fact["version"],
                                                    "description": "Led the checkout migration to React and Next.js"})
    assert alice.get("/v1/resumes").json()["items"][0]["freshness"] == "outdated"
    fv = alice.get("/v1/profile").json()["facts"][0]["factVersionId"]
    fake(monkeypatch, [
        {"statements": [{"type": "candidate_fact", "text": "Led the checkout migration to React and Next.js.",
                         "cited_fact_version_ids": [fv]}]},
        {"results": [{"statement_index": 0, "supported": True}]},
    ])
    assert bob.write("POST", f"/v1/resumes/{rid}/regenerate").status_code == 404
    r = alice.write("POST", f"/v1/resumes/{rid}/regenerate")
    assert r.status_code == 202 and r.json()["resume_id"] == rid
    assert run_once(pg.worker) and task_row(pg, "regenerate")[0] == "succeeded"
    [item] = alice.get("/v1/resumes").json()["items"]
    assert (item["id"], item["freshness"], item["template"]) == (rid, "current", "Classic")
    lines = [line["text"] for s in alice.get(f"/v1/resumes/{rid}").json()["sections"] for line in s["lines"]]
    assert lines == ["Led the checkout migration to React and Next.js."]
    assert count(pg, "SELECT count(*) FROM resumes") == 1
    assert count(pg, "SELECT max(version) FROM resume_versions") == 2
    assert count(pg, "SELECT version FROM resume_drafts") == 2


def test_a_newly_confirmed_fact_makes_the_master_outdated(pg, alice, monkeypatch):
    master_resume(pg, alice, monkeypatch)
    assert alice.get("/v1/resumes").json()["items"][0]["freshness"] == "current"
    confirmed_fact(alice, "Built a design system used by 4 teams", 2)  # cites nothing on the master yet
    [item] = alice.get("/v1/resumes").json()["items"]
    assert item["freshness"] == "outdated" and "changed" in item["outdatedReason"]


def test_export_zip_has_data_exported_files_and_current_pdfs(pg, alice, bob, monkeypatch):
    rid = master_resume(pg, alice, monkeypatch)
    alice.write("PATCH", "/v1/me", {"name": "Rohan Iyer"})
    export_id = export(pg, alice, rid, "docx", "modern")
    imp = upload(alice, "my cv.txt", b"Rohan Iyer\nFrontend Engineer\n").json()["import"]
    r = alice.get("/v1/me/export")
    assert r.headers["content-disposition"] == 'attachment; filename="hunt-export.zip"'
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(z.namelist())
    assert names == {"data.json", f"resumes/{rid}/exported-v1-{export_id}.docx", f"resumes/{rid}/current-classic.pdf",
                     f"uploads/{imp['id']}.txt"}
    assert z.read(f"uploads/{imp['id']}.txt") == b"Rohan Iyer\nFrontend Engineer\n"
    assert z.read(f"resumes/{rid}/current-classic.pdf").startswith(b"%PDF")
    assert z.read(f"resumes/{rid}/exported-v1-{export_id}.docx") == alice.get(f"/v1/exports/{export_id}/download").content
    assert json.loads(z.read("data.json"))["data"]["resumes"][0]["id"] == rid
    assert zipfile.ZipFile(io.BytesIO(bob.get("/v1/me/export").content)).namelist() == ["data.json"]
