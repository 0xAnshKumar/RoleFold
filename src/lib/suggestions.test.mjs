import assert from "node:assert/strict";
import test from "node:test";
import { suggest } from "./suggestions.ts";

const NOW = new Date(Date.UTC(2026, 10, 21));
const role = (o) => ({ id: "r1", title: "Frontend Engineer", org: "Northwind", dates: "Jul 2021 – Present", factIds: [], ...o });
const clean = { email: "a@b.c", phone: "1", drafts: 0, roles: [], skills: [{ name: "React", evidence: 1 }], education: [{}], gaps: [] };
const ids = (s) => s.map((x) => x.id.split(":")[0]);

test("a clean profile has nothing to fix", () => {
  assert.deepEqual(suggest(clean, [], NOW), []);
});

test("line rules: one card per line, worst problem first", () => {
  const facts = [
    { id: "f1", role: "x", text: "Worked on the checkout page", version: 2 },
    { id: "f2", role: "x", text: "I cut load time from 4s to 2s" },
    { id: "f3", role: "x", text: Array(45).fill("word").join(" ") + " 5" },
    { id: "f4", role: "x", text: "Built the design system used by 4 teams" },
  ];
  const s = suggest(clean, facts, NOW);
  assert.deepEqual(ids(s), ["weak", "first-person", "long"]);
  assert.equal(s[0].title, "“Worked on” hides what you did");
  assert.equal(s[0].id, "weak:f1:2");
  assert.equal(s[0].kind, "edit");
});

test("profile rules: drafts, empty role, no skills, no education, contact; fixes come first", () => {
  const s = suggest({ ...clean, email: "", drafts: 2, roles: [role()], skills: [], education: [] }, [], NOW);
  assert.deepEqual(ids(s), ["drafts", "empty-role", "no-skills", "contact", "no-education"]);
  assert.equal(s[0].title, "2 entries still to confirm");
});

test("same opener on 3 lines of one role", () => {
  const facts = ["Built a, saving 1h", "Built b, saving 2h", "built c, saving 3h"].map((text, i) => ({ id: `f${i}`, role: "x", text }));
  const s = suggest({ ...clean, roles: [role({ factIds: ["f0", "f1", "f2"] })] }, facts, NOW);
  assert.deepEqual(ids(s), ["repeat"]);
  assert.match(s[0].title, /^3 lines under Frontend Engineer start with “Built”/);
});

test("gaps of 6+ months are flagged unless a career break covers them", () => {
  const roles = [role({ id: "a", dates: "Jun 2019 – Jun 2020", factIds: ["x"] }), role({ id: "b", dates: "Mar 2021 – Present", factIds: ["x"] })];
  const s = suggest({ ...clean, roles }, [], NOW);
  assert.deepEqual(ids(s), ["gap"]);
  assert.equal(s[0].title, "A 9-month gap: Jun 2020 to Mar 2021");
  assert.deepEqual(suggest({ ...clean, roles, gaps: [{ dates: "Jul 2020 – Feb 2021" }] }, [], NOW), []);
  const short = [role({ id: "a", dates: "Jun 2019 – Jun 2020", factIds: ["x"] }), role({ id: "b", dates: "Oct 2020 – Present", factIds: ["x"] })];
  assert.deepEqual(suggest({ ...clean, roles: short }, [], NOW), []);
});

test("XYZ: no number gets 'Can you measure it?' or, with a result word, 'Add a number'", () => {
  const facts = [
    { id: "a", role: "x", text: "Built the checkout page in React" },
    { id: "b", role: "x", text: "Rebuilt the checkout page, reducing drop-offs" },
    { id: "c", role: "x", text: "Cut checkout load time from 4s to 2.1s by lazy-loading images" },
  ];
  const s = suggest(clean, facts, NOW);
  assert.deepEqual(ids(s), ["no-measure", "no-number"]);
  assert.equal(s[0].fact.id, "a");
  assert.ok(s[0].hint);
});
