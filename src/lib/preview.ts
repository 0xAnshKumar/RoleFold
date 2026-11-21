// The live resume preview on the onboarding review screen: confirmed facts plus the draft lines still ticked,
// shaped like a Resume for ResumePaper. Plain code; the real master resume is built by the API from the same facts.

type Line = { id: string; text: string };
type Role = { id: string; title: string; org: string; dates: string; factIds: string[] };
type Project = { id: string; name: string; stack?: string; dates: string; factIds?: string[] };
type Group = { role: string; dates: string; kind?: "experience" | "project"; experienceId?: string; projectId?: string; drafts: Line[] };
type Edu = { degree: string; org: string; dates: string };

export type PreviewInput = {
  about: { name: string; location: string; email: string; phone: string; links?: string[] };
  target: string;
  roles: Role[];
  projects: Project[];
  facts: Line[];
  groups: Group[];
  /** Draft ids the user unticked: left out. Everything else is in. */
  off: Set<string>;
  /** Draft text edited on this screen, by id. */
  edits?: Record<string, string>;
  education: Edu[];
  achievements?: string[];
};

export function buildPreview(x: PreviewInput) {
  const text = new Map(x.facts.map((f) => [f.id, f.text]));
  // A draft confirmed on this screen also arrives in `facts` after a refresh: show it once.
  const on = (g: Group) => g.drafts.filter((d) => !x.off.has(d.id) && !text.has(d.id)).map((d) => ({ id: d.id, text: x.edits?.[d.id] ?? d.text, factId: d.id }));
  const confirmed = (ids: string[]) => ids.filter((id) => text.has(id)).map((id) => ({ id, text: text.get(id)!, factId: id }));
  const used = new Set<Group>();
  const take = (match: (g: Group) => boolean) =>
    x.groups.filter((g) => match(g) && !used.has(g) && used.add(g)).flatMap(on);

  const sections = x.roles.map((r) => ({ title: r.title, org: r.org, dates: r.dates, lines: [...confirmed(r.factIds), ...take((g) => g.experienceId === r.id)] }));
  const projects = x.projects.map((p) => ({ name: p.name, stack: p.stack ?? "", dates: p.dates, lines: [...confirmed(p.factIds ?? []), ...take((g) => g.projectId === p.id)] }));
  // Groups the profile's role list doesn't know yet (sample data, or a refresh still on its way): "Title · Org, City".
  for (const g of x.groups.filter((g) => !used.has(g))) {
    if (g.kind === "project") projects.push({ name: g.role, stack: "", dates: g.dates, lines: on(g) });
    else {
      const [title, ...org] = g.role.split(" · ");
      sections.push({ title, org: org.join(" · "), dates: g.dates, lines: on(g) });
    }
  }

  return {
    resume: {
      id: "preview",
      name: x.about.name.trim() || "Your name",
      target: x.target,
      template: "",
      sections: sections.filter((s) => s.lines.length),
    },
    extras: {
      contact: [x.about.location, x.about.email, x.about.phone, ...(x.about.links ?? [])].map((v) => v.trim()).filter(Boolean).join(" · "),
      summary: "",
      skillsSummary: [] as { area: string; proof: string }[],
      projects: projects.filter((p) => p.lines.length).map((p) => ({ name: p.name, stack: p.stack, dates: p.dates, line: p.lines.map((l) => l.text).join(" "), bullets: p.lines.map((l) => l.text) })),
      education: x.education.map((e) => ({ ...e, detail: "" })),
      skills: [] as { group: string; items: string }[],
      achievements: x.achievements ?? [],
      publications: [] as string[],
      languages: [] as string[],
    },
    lines: sections.reduce((n, s) => n + s.lines.length, 0) + projects.reduce((n, p) => n + p.lines.length, 0),
  };
}
