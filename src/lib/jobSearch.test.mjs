import assert from "node:assert/strict";
import test from "node:test";
import { defaultSearch, searchLinks, yearsOfExperience } from "./jobSearch.ts";

const NOW = new Date(Date.UTC(2026, 10, 21));

test("years of experience: overlapping roles count once, unreadable dates are skipped", () => {
  assert.equal(yearsOfExperience([{ dates: "Jul 2021 – Present" }, { dates: "Jun 2019 – Jun 2021" }], NOW), 7);
  assert.equal(yearsOfExperience([{ dates: "Jan 2020 – Dec 2022" }, { dates: "Jun 2021 – Jun 2022" }], NOW), 2);
  assert.equal(yearsOfExperience([{ dates: "Jan 2018 – Jan 2019" }, { dates: "Jan 2024 – Jan 2025" }], NOW), 2);
  assert.equal(yearsOfExperience([{ dates: "? – Present" }], NOW), null);
  assert.equal(yearsOfExperience([], NOW), null);
});

test("default search comes from goals, proven skills and preferences", () => {
  const q = defaultSearch({
    location: "Pune",
    roles: [{ title: "Frontend Engineer", dates: "Jul 2021 – Present" }],
    skills: [{ name: "Jest", evidence: 1 }, { name: "GraphQL", evidence: 0 }, { name: "React", evidence: 3 }, { name: "TypeScript", evidence: 2 }],
    goals: { roles: ["Senior Frontend Engineer"] },
    prefs: { locations: ["Bengaluru"], modes: ["Hybrid", "Remote"] },
  });
  assert.deepEqual({ ...q, years: null }, { role: "Senior Frontend Engineer", skills: ["React", "TypeScript"], location: "Bengaluru", remote: false, years: null });
  assert.equal(defaultSearch({ location: null, roles: [{ title: "Designer", dates: "?" }], skills: [], goals: { roles: [] }, prefs: { locations: [], modes: ["Remote"] } }).role, "Designer");
});

test("links carry the search into each site's format", () => {
  const links = Object.fromEntries(searchLinks({ role: "Senior Frontend Engineer", skills: ["React"], location: "Bengaluru", remote: false, years: 5 }).map((l) => [l.site, new URL(l.href)]));
  assert.equal(links.LinkedIn.searchParams.get("keywords"), "Senior Frontend Engineer React");
  assert.equal(links.LinkedIn.searchParams.get("location"), "Bengaluru");
  assert.equal(links.LinkedIn.searchParams.get("f_WT"), null);
  assert.equal(links.Naukri.pathname, "/senior-frontend-engineer-jobs-in-bengaluru");
  assert.equal(links.Naukri.searchParams.get("experience"), "5");
  assert.equal(links.Wellfound.pathname, "/role/l/frontend-engineer/bangalore");
  assert.match(links["Company career pages"].searchParams.get("q"), /site:boards\.greenhouse\.io.*"React" "Bengaluru"$/);
});

test("remote searches drop the city and use remote filters", () => {
  const links = Object.fromEntries(searchLinks({ role: "Backend Engineer II", skills: [], location: "Pune", remote: true, years: null }).map((l) => [l.site, new URL(l.href)]));
  assert.equal(links.LinkedIn.searchParams.get("f_WT"), "2");
  assert.equal(links.Naukri.pathname, "/backend-engineer-ii-jobs");
  assert.equal(links.Indeed.searchParams.get("sc"), "0kf:attr(DSQF7);");
  assert.equal(links.Wellfound.pathname, "/role/r/backend-engineer");
});
