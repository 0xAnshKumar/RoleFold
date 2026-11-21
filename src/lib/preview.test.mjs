import assert from "node:assert/strict";
import test from "node:test";
import { buildPreview } from "./preview.ts";

const base = {
  about: { name: "", location: "Pune", email: "a@b.c", phone: "" },
  target: "Engineer",
  roles: [{ id: "r1", title: "Engineer", org: "Acme, Pune", dates: "2021 – Present", factIds: ["f1"] }],
  projects: [{ id: "p1", name: "Tool", dates: "", factIds: [] }],
  facts: [{ id: "f1", text: "Confirmed line" }],
  groups: [
    { role: "Engineer · Acme, Pune", dates: "2021 – Present", kind: "experience", experienceId: "r1", drafts: [{ id: "d1", text: "Draft one" }, { id: "d2", text: "Draft two" }] },
    { role: "Tool", dates: "", kind: "project", projectId: "p1", drafts: [{ id: "d3", text: "Made a tool." }] },
    { role: "Analyst · Beta", dates: "2019 – 2021", drafts: [{ id: "d4", text: "Orphan draft" }] },
  ],
  off: new Set(["d2"]),
  edits: { d1: "Draft one, edited" },
  education: [{ degree: "B.Tech", org: "PES", dates: "2015 – 2019" }],
};

test("preview: confirmed + ticked drafts per role, edits applied, unticked left out", () => {
  const p = buildPreview(base);
  assert.equal(p.resume.name, "Your name");
  assert.deepEqual(p.resume.sections.map((s) => [s.title, s.org, s.lines.map((l) => l.text)]), [
    ["Engineer", "Acme, Pune", ["Confirmed line", "Draft one, edited"]],
    ["Analyst", "Beta", ["Orphan draft"]],
  ]);
  assert.deepEqual(p.extras.projects, [{ name: "Tool", stack: "", dates: "", line: "Made a tool.", bullets: ["Made a tool."] }]);
  assert.equal(p.extras.contact, "Pune · a@b.c");
  assert.equal(p.lines, 4);
});

test("preview: a draft already confirmed (it's in facts after a refresh) shows once", () => {
  const p = buildPreview({ ...base, facts: [...base.facts, { id: "d1", text: "Draft one, edited" }], roles: [{ ...base.roles[0], factIds: ["f1", "d1"] }] });
  assert.deepEqual(p.resume.sections[0].lines.map((l) => l.text), ["Confirmed line", "Draft one, edited"]);
});
