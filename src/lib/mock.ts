// Sample data for demo mode, and the response contract: /v1 routes return these exact shapes
// (src/lib/data.ts maps the older TRD-shaped routes /profile, /facts and /usage onto them).
// Example persona: a frontend engineer. Companies are fictional.

export type Status = "supported" | "partial" | "no_evidence" | "gap" | "conflict" | "unknown" | "match";
export type Verdict = "Strong fit" | "Good fit with gaps" | "Stretch" | "Poor fit" | "Not eligible" | "Not enough detail in this posting";

export type Fact = {
  id: string;
  role: string;
  text: string;
  responsibility: "Contributed" | "Owned" | "Led" | "Managed";
  confirmedOn: string;
  /** Optimistic-lock version, needed to edit (absent in sample data). */
  version?: number;
};

/** API responsibility_level is the index + 1. */
export const LEVELS: Fact["responsibility"][] = ["Contributed", "Owned", "Led", "Managed"];

export const facts: Fact[] = [
  { id: "F-12", role: "Frontend Engineer · Northwind Commerce, Bengaluru", text: "Led the checkout migration from AngularJS to React, cutting the bundle from 1.8 MB to 640 KB", responsibility: "Led", confirmedOn: "3 Oct 2026" },
  { id: "F-14", role: "Frontend Engineer · Northwind Commerce, Bengaluru", text: "Built and maintain a React component library used by 4 product teams", responsibility: "Owned", confirmedOn: "3 Oct 2026" },
  { id: "F-15", role: "Frontend Engineer · Northwind Commerce, Bengaluru", text: "Contributed to cutting product-page LCP from 4.2s to 2.1s by moving images to a CDN with responsive sizes", responsibility: "Contributed", confirmedOn: "3 Oct 2026" },
  { id: "F-21", role: "Software Engineer · Pixelcraft Studio, Pune", text: "Wrote Jest unit tests that raised coverage on the web app from 35% to 70%", responsibility: "Owned", confirmedOn: "3 Oct 2026" },
];

// `version` is the fact's optimistic-lock version, needed to confirm it (absent in sample data).
export type Draft = { id: string; text: string; numbers: string[]; suggested: Fact["responsibility"]; version?: number };
export type DraftGroup = { role: string; dates: string; drafts: Draft[] };

export const draftGroups: DraftGroup[] = [
  {
    role: "Frontend Engineer · Northwind Commerce, Bengaluru",
    dates: "Jul 2021 – Present",
    drafts: [
      { id: "d1", text: "Led the checkout migration from AngularJS to React, cutting the bundle from 1.8 MB to 640 KB", numbers: ["1.8", "640"], suggested: "Led" },
      { id: "d2", text: "Built a React component library used by 4 product teams", numbers: ["4"], suggested: "Owned" },
      { id: "d3", text: "Helped cut product-page LCP from 4.2s to 2.1s", numbers: ["4.2", "2.1"], suggested: "Contributed" },
    ],
  },
  {
    role: "Software Engineer · Pixelcraft Studio, Pune",
    dates: "Jun 2019 – Jun 2021",
    drafts: [
      { id: "d4", text: "Shipped 12 marketing sites in Next.js for client brands", numbers: ["12"], suggested: "Owned" },
      { id: "d5", text: "Raised unit-test coverage from 35% to 70% with Jest", numbers: ["35", "70"], suggested: "Owned" },
    ],
  },
];

export type Requirement = {
  /** Requirement id, needed for "I don't have this" (absent in sample data). */
  id?: string;
  text: string;
  importance: "required" | "preferred";
  status: Status;
  quote: string;
  factId?: string;
  note?: string;
};

export type Match = {
  id: string;
  title: string;
  company: string;
  source: string;
  verdict: Verdict;
  reasons: string[];
  eligibility: { field: string; value: string; status: Status; quote: string | null }[];
  requirements: Requirement[];
  goalFit: { status: "aligned" | "partly" | "not_aligned" | "unknown"; text: string };
  questions: string[];
  enrichment: string;
  profileNote: string;
  /** "outdated" when your confirmed facts changed since the analysis ran. */
  freshness?: "current" | "outdated";
};

export const matches: Match[] = [
  {
    id: "kestrel-frontend",
    title: "Senior Frontend Engineer",
    company: "Kestrel Pay, Bengaluru",
    source: "Pasted by you · 8 Oct 2026",
    verdict: "Good fit with gaps",
    freshness: "current",
    reasons: [
      "Every eligibility gate is met: location, work mode and experience.",
      "3 of 4 required skills have evidence in your profile.",
      "GraphQL is asked for, but nothing is recorded yet.",
    ],
    eligibility: [
      { field: "Location", value: "Bengaluru, hybrid", status: "match", quote: "Based in Bengaluru, hybrid (3 days in office)" },
      { field: "Experience", value: "4+ years", status: "match", quote: "4+ years building production web applications" },
      { field: "Employment", value: "Full-time", status: "match", quote: "This is a full-time, permanent role" },
      { field: "Notice period", value: "Not stated", status: "unknown", quote: null },
    ],
    requirements: [
      { text: "React and TypeScript in production", importance: "required", status: "supported", quote: "Deep experience with React and TypeScript in production", factId: "F-12" },
      { text: "Design systems / component libraries", importance: "required", status: "supported", quote: "You have built or maintained a shared component library", factId: "F-14" },
      { text: "Web performance (Core Web Vitals)", importance: "required", status: "partial", quote: "Own web performance: Core Web Vitals, bundle size, rendering", factId: "F-15", note: "You contributed to LCP work; ownership of performance isn't recorded." },
      { id: "r-graphql", text: "GraphQL", importance: "required", status: "no_evidence", quote: "Experience consuming GraphQL APIs (Apollo or urql)" },
      { text: "Testing with Jest or Playwright", importance: "preferred", status: "supported", quote: "Comfortable with Jest and Playwright is a plus", factId: "F-21" },
    ],
    goalFit: { status: "aligned", text: "Matches your goal: senior frontend role at a product company in Bengaluru." },
    questions: ["What's the notice period you can work with?", "Is GraphQL already in production, or being introduced?"],
    enrichment: "Have you used GraphQL anywhere, even on a side project? Which client, and for what?",
    profileNote: "Reflects your profile as of today, 10:42",
  },
  {
    id: "lumen-frontend",
    title: "Frontend Engineer II",
    company: "Lumen Health, Remote",
    source: "Pasted by you · 6 Oct 2026",
    verdict: "Strong fit",
    freshness: "current",
    reasons: ["Every stated eligibility item fits your preferences.", "3 of 3 required items have evidence in your profile."],
    eligibility: [
      { field: "Location", value: "Remote, India", status: "match", quote: "Fully remote within India" },
      { field: "Experience", value: "3+ years", status: "match", quote: "3+ years of professional frontend experience" },
      { field: "Employment", value: "Full-time", status: "match", quote: "Full-time role on our patient app team" },
    ],
    requirements: [
      { text: "React and TypeScript", importance: "required", status: "supported", quote: "Strong React and TypeScript skills", factId: "F-12" },
      { text: "Shared UI components", importance: "required", status: "supported", quote: "Experience building reusable UI components", factId: "F-14" },
      { text: "Unit testing with Jest", importance: "required", status: "supported", quote: "You write unit tests with Jest as a habit", factId: "F-21" },
      { text: "Web performance", importance: "preferred", status: "partial", quote: "Interest in web performance is a bonus", factId: "F-15", note: "You contributed to LCP work; ownership of performance isn't recorded." },
      { text: "Accessibility (WCAG)", importance: "preferred", status: "no_evidence", quote: "Familiarity with WCAG accessibility guidelines is nice to have" },
    ],
    goalFit: { status: "aligned", text: "Matches your goal: frontend engineering at a product company." },
    questions: ["What's the notice period you can work with?"],
    enrichment: "Have you used Accessibility (WCAG) anywhere, even on a side project? What did you do with it?",
    profileNote: "Reflects your profile as of 6 Oct 2026, 18:05",
  },
  {
    id: "orbit-staff-frontend",
    title: "Staff Frontend Engineer",
    company: "Orbit Logistics, Pune",
    source: "Pasted by you · 4 Oct 2026",
    verdict: "Stretch",
    freshness: "current",
    reasons: [
      "2 of 5 required items have evidence in your profile.",
      "Micro-frontend architecture is asked for, but nothing is recorded yet.",
      "Leading a frontend team is asked for, but nothing is recorded yet.",
      "Node.js backend-for-frontend is asked for, but nothing is recorded yet.",
      "Location: doesn't match your preference",
    ],
    eligibility: [
      { field: "Location", value: "Pune, hybrid", status: "conflict", quote: "Hybrid, 3 days a week at our Pune office" },
      { field: "Experience", value: "7+ years", status: "match", quote: "7+ years of frontend engineering" },
      { field: "Employment", value: "Full-time", status: "match", quote: "Full-time, permanent" },
    ],
    requirements: [
      { text: "React and TypeScript at scale", importance: "required", status: "supported", quote: "Expert in React and TypeScript at scale", factId: "F-12" },
      { text: "Design systems", importance: "required", status: "supported", quote: "You have shaped a design system used across teams", factId: "F-14" },
      { text: "Micro-frontend architecture", importance: "required", status: "no_evidence", quote: "Experience designing a micro-frontend architecture" },
      { text: "Leading a frontend team", importance: "required", status: "no_evidence", quote: "Must have led a team of 5+ frontend engineers" },
      { text: "Node.js backend-for-frontend", importance: "required", status: "no_evidence", quote: "Comfortable building Node.js backend-for-frontend services" },
      { text: "Web performance", importance: "preferred", status: "partial", quote: "Web performance budgets are a plus", factId: "F-15", note: "You contributed to LCP work; ownership of performance isn't recorded." },
    ],
    goalFit: { status: "partly", text: "Partly matches your goal: Senior Frontend Engineer." },
    questions: ["What's the notice period you can work with?", "Is the Pune office required, or is remote possible?"],
    enrichment: "Have you used Micro-frontend architecture anywhere, even on a side project? What did you do with it?",
    profileNote: "Reflects your profile as of 4 Oct 2026, 09:12",
  },
];

/** `status` "code_checked_only": an edit checked in code, not yet re-read by the verifier. */
/** `factIds`: every fact the line cites (live API); `factId` is the first. */
export type Statement = { id: string; text: string; factId: string; factIds?: string[]; status?: string };
export type Resume = {
  id: string;
  /** May be "" until names are stored; the page falls back to the profile name. */
  name: string;
  target: string;
  /** Display name from templates.ts; `templateId` is its id. */
  template: string;
  templateId?: string;
  /** The draft's optimistic-lock version, needed to edit a line (absent in sample data). */
  version?: number;
  freshness?: "current" | "outdated";
  outdatedReason?: string | null;
  /** Lines that failed their checks and are kept out of the resume. */
  withheld?: { id: string; text: string; reasons: string[] }[];
  /** `owner`: the role or project the lines belong to (live API; absent for the summary). */
  sections: { title: string; org?: string; dates?: string; owner?: { type: "experience" | "project"; id: string }; lines: Statement[] }[];
  /** Contact, education, skills… for the preview, from the same data the export renders (live API only). */
  extras?: typeof resumeExtras;
};

/** PATCH /v1/resumes/{id}/statements/{sid} body {text, version} -> the checked statement and the updated resume (TRD §7.4). */
export type StatementPatchResult = { statement: Statement & { reasons: string[] }; resume: Resume };

export const resumes: Resume[] = [
  {
    id: "frontend-engineer",
    name: "Rohan Iyer",
    target: "Tailored for Senior Frontend Engineer · Kestrel Pay",
    template: "Compact Tech",
    templateId: "tech",
    sections: [
      {
        title: "Frontend Engineer",
        org: "Northwind Commerce, Bengaluru",
        dates: "Jul 2021 – Present",
        lines: [
          { id: "s1", text: "Led the checkout migration from AngularJS to React, cutting the bundle from 1.8 MB to 640 KB.", factId: "F-12" },
          { id: "s2", text: "Built and maintain a React component library used by 4 product teams.", factId: "F-14" },
          { id: "s3", text: "Contributed to cutting product-page LCP from 4.2s to 2.1s by moving images to a CDN.", factId: "F-15" },
        ],
      },
      {
        title: "Software Engineer",
        org: "Pixelcraft Studio, Pune",
        dates: "Jun 2019 – Jun 2021",
        lines: [{ id: "s4", text: "Raised unit-test coverage on the web app from 35% to 70% with Jest.", factId: "F-21" }],
      },
    ],
  },
];

export const findFact = (id?: string) => facts.find((f) => f.id === id);

// ---- lists and profile for the app screens ----

export type ResumeListItem = {
  id: string;
  kind: "master" | "tailored";
  name: string;
  target: string;
  template: string;
  updated: string;
  freshness: "current" | "outdated";
  outdatedReason?: string;
  parent?: string;
};

export const resumeList: ResumeListItem[] = [
  { id: "frontend-master", kind: "master", name: "Frontend Engineer", target: "Senior frontend roles, product companies", template: "Compact Tech", updated: "8 Oct 2026", freshness: "outdated", outdatedReason: "1 fact changed since this version (LCP 2.3s → 2.1s)" },
  { id: "frontend-engineer", kind: "tailored", name: "Kestrel Pay · Senior Frontend Engineer", target: "Tailored for a pasted job", template: "Compact Tech", updated: "8 Oct 2026", freshness: "current", parent: "frontend-master" },
  { id: "fullstack-master", kind: "master", name: "Full-stack Engineer", target: "Exploring: Node + React roles", template: "Modern", updated: "2 Oct 2026", freshness: "current" },
];

export type Goals = { roles: string[]; industries: string[]; seniority: string };
export type Prefs = { locations: string[]; modes: string[]; type: string; visa: string; notice: string };
/** GET /v1/profile (plus `facts`, `draftGroups`, `profileVersion`, read in src/lib/data.ts). */
export type Profile = typeof profile;

/** Education rows: `id`, `status` and `version` are needed to confirm one (TRD §5.2). */
export type Education = { id?: string; degree: string; org: string; dates: string; status?: "draft" | "confirmed"; version?: number };
/** Every career break the user recorded; only `showOnResume` ones go on resumes (a dated "Career break" entry). */
export type CareerBreak = { id: string; dates: string; reason: string; showOnResume: boolean; version?: number };
/** One resume line as the user wrote it, under the template's Achievements or Publications section. */
export type Achievement = { id: string; kind: "achievement" | "publication"; text: string; version?: number };
/** Imported languages are drafts until confirmed. */
export type Language = { id: string; name: string; proficiency: string; status: "draft" | "confirmed"; version?: number };
/** Enrichment question (GET /v1/enrichment-questions items): the answer becomes a draft fact. */
export type Question = { id: string; question: string };

export const questions: Question[] = [
  { id: "q1", question: "You led the React migration at Northwind. Did checkout get faster or convert better afterwards?" },
];

export const profile = {
  name: "Rohan Iyer",
  /** Contact lines for exports (PATCH /v1/me); never sent to a model. */
  email: "rohan.iyer@example.com",
  phone: "+91 98765 43210",
  headline: "Frontend Engineer · React, TypeScript, web performance",
  location: "Bengaluru",
  confirmed: 9,
  drafts: 6,
  roles: [
    { id: "exp-northwind", title: "Frontend Engineer", org: "Northwind Commerce, Bengaluru", dates: "Jul 2021 – Present", factIds: ["F-12", "F-14", "F-15"] },
    { id: "exp-pixelcraft", title: "Software Engineer", org: "Pixelcraft Studio, Pune", dates: "Jun 2019 – Jun 2021", factIds: ["F-21"] },
  ],
  skills: [
    { name: "React", evidence: 3 },
    { name: "TypeScript", evidence: 2 },
    { name: "Next.js", evidence: 1 },
    { name: "Web performance", evidence: 1 },
    { name: "Jest", evidence: 1 },
    { name: "Playwright", evidence: 0 },
    { name: "GraphQL", evidence: 0 },
  ],
  education: [{ id: "edu-pes", degree: "B.Tech, Computer Science", org: "PES University, Bengaluru", dates: "2015 – 2019", status: "draft" }] as Education[],
  /** Projects to file a fact under (the match page's "Save as draft fact"). */
  projects: [{ id: "proj-ledgerly", name: "Ledgerly", dates: "Jan 2023 – Present" }] as { id: string; name: string; dates: string; factIds?: string[] }[],
  gaps: [] as CareerBreak[],
  achievements: [
    { id: "ach-1", kind: "achievement", text: "Speaker, React Bangalore meetup, 2024" },
    { id: "ach-2", kind: "publication", text: "Iyer R. “Shipping smaller bundles.” Northwind engineering blog, 2025." },
  ] as Achievement[],
  languages: [
    { id: "lang-en", name: "English", proficiency: "Fluent", status: "confirmed" },
    { id: "lang-hi", name: "Hindi", proficiency: "Native", status: "confirmed" },
    { id: "lang-kn", name: "Kannada", proficiency: "", status: "draft" },
  ] as Language[],
  goals: { roles: ["Senior Frontend Engineer"], industries: ["Fintech", "E-commerce"], seniority: "Senior" } as Goals,
  prefs: { locations: ["Bengaluru"], modes: ["Hybrid", "Remote"], type: "Full-time", visa: "Not needed", notice: "60 days" } as Prefs,
};

export type Usage = { tailored: { used: number; limit: number }; matches: { used: number; limit: number }; resetsOn: string };

export const usage: Usage = {
  tailored: { used: 3, limit: 10 },
  matches: { used: 7, limit: 30 },
  resetsOn: "1 Nov 2026",
};

/** GET /v1/jobs items. `verdict` is null while the job is still being analysed. */
export type JobStatus = "saved" | "applied" | "not_interested" | "dismissed";
export type SavedJob = { id: string; title: string; company: string; verdict: Verdict | null; status: JobStatus; gaps: number; added: string };

export const savedJobs: SavedJob[] = [
  { id: "kestrel-frontend", title: "Senior Frontend Engineer", company: "Kestrel Pay, Bengaluru", verdict: "Good fit with gaps", status: "saved", gaps: 1, added: "8 Oct" },
  { id: "lumen-frontend", title: "Frontend Engineer II", company: "Lumen Health, Remote", verdict: "Strong fit", status: "applied", gaps: 0, added: "6 Oct" },
  { id: "orbit-staff-frontend", title: "Staff Frontend Engineer", company: "Orbit Logistics, Pune", verdict: "Stretch", status: "saved", gaps: 3, added: "4 Oct" },
];

/** POST /v1/jobs/{id}/feedback body. Latest vote per job wins. */
export type JobFeedback = { vote: "up" | "down"; reason: string | null };

// Extra resume content the templates need (all from confirmed facts in a real run).
export const resumeExtras = {
  contact: "Bengaluru · rohan.iyer@example.com · +91 98xxx xxx10 · github.com/rohan-iyer",
  summary: "Frontend engineer with 7 years building React and TypeScript products; led a checkout migration and owns a shared component library.",
  skillsSummary: [
    { area: "Frontend architecture", proof: "AngularJS → React checkout migration (F-12)" },
    { area: "Design systems", proof: "Component library used by 4 teams (F-14)" },
    { area: "Web performance", proof: "Product-page LCP 4.2s → 2.1s (F-15)" },
  ],
  projects: [{ name: "Ledgerly", stack: "Next.js, TypeScript, Postgres", line: "Open-source expense splitter; 1.2k GitHub stars." }],
  education: [{ degree: "B.Tech, Computer Science", org: "PES University, Bengaluru", dates: "2015 – 2019", detail: "CGPA 8.4 / 10" }],
  skills: [
    { group: "Languages", items: "TypeScript, JavaScript, HTML, CSS" },
    { group: "Frameworks", items: "React, Next.js, Redux" },
    { group: "Testing", items: "Jest, Playwright" },
  ],
  achievements: ["Speaker, React Bangalore meetup, 2024"],
  publications: ["Iyer R. “Shipping smaller bundles.” Northwind engineering blog, 2025."],
};
