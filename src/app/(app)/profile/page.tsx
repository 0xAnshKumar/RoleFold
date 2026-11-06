import type { Metadata } from "next";
import a from "@/components/app/app.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SkillChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { getProfile, isDemo } from "@/lib/data";
import { EducationList, Experience, GoalsCard, PrefsCard, ProfileHeader } from "./Edit";
import { Achievements, CareerBreaks, Languages } from "./Sections";
import SkillsInsight from "./SkillsInsight";
import s from "./profile.module.css";

export const metadata: Metadata = { title: "Profile" };

// Plain anchor links (DESIGN.md 4.7): no scroll-position tracking (owner rule).
const NAV = [
  { id: "exp", label: "Roles and facts" },
  { id: "skills", label: "Skills" },
  { id: "edu", label: "Education" },
  { id: "achievements", label: "Achievements" },
  { id: "languages", label: "Languages" },
  { id: "breaks", label: "Career breaks" },
  { id: "goals", label: "Goals" },
];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={s.section} aria-labelledby={id}>
      <div className={s.sectionHead}>
        <h2 id={id} className={a.h2}>
          {title}
        </h2>
        {note && <p className={a.note}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function ProfilePage() {
  const [{ profile, facts }, demo] = await Promise.all([getProfile(), isDemo()]);
  return (
    <>
      <ProfileHeader initial={{ name: profile.name, headline: profile.headline, location: profile.location, email: profile.email, phone: profile.phone }} demo={demo} />

      {profile.drafts > 0 && (
        <div className={s.queue} role="status">
          <Icon name="inbox" size={20} />
          <p className={s.queueText}>
            <b>
              {profile.drafts} {profile.drafts === 1 ? "entry" : "entries"} waiting for you to confirm.
            </b>{" "}
            They came from your last import. Nothing is used until you confirm it.
          </p>
          <ButtonLink href="/onboarding?step=confirm" size="sm">
            Review and confirm
          </ButtonLink>
        </div>
      )}

      <div className={s.layout}>
        <nav aria-label="On this page" className={s.nav}>
          <p className={s.navTitle}>On this page</p>
          <ul>
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`}>{n.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={s.main}>
          <Experience roles={profile.roles} projects={profile.projects} facts={facts} confirmed={profile.confirmed} demo={demo} />

          <Section id="skills" title="Skills" note="A skill counts in job checks only when a fact proves it.">
            <Card>
              {profile.skills.length === 0 ? (
                <p className={a.note}>None yet. Skills appear here as your confirmed facts prove them.</p>
              ) : (
                <ul className={s.skills}>
                  {profile.skills.map((k) => (
                    <li key={k.name}>
                      <SkillChip confirmed={k.evidence > 0}>
                        {k.name}
                        <span className={s.skillEv}>{k.evidence ? ` · ${k.evidence} fact${k.evidence > 1 ? "s" : ""}` : " · no fact yet"}</span>
                      </SkillChip>
                    </li>
                  ))}
                </ul>
              )}
              <SkillsInsight />
            </Card>
          </Section>

          <Section id="edu" title="Education" note="Confirm a degree so job checks can count it.">
            <EducationList initial={profile.education} demo={demo} />
          </Section>

          <Section id="achievements" title="Achievements and publications" note="On resumes whose template has an Achievements or Publications section.">
            <Achievements initial={profile.achievements} demo={demo} />
          </Section>

          <Section id="languages" title="Languages" note="Confirmed languages go at the end of every resume.">
            <Languages initial={profile.languages} demo={demo} />
          </Section>

          <Section id="breaks" title="Career breaks">
            <CareerBreaks initial={profile.gaps} demo={demo} />
          </Section>

          <Section id="goals" title="Goals" note="What job checks and the feed rank against.">
            <div className={s.goalsGrid}>
              <GoalsCard initial={profile.goals} demo={demo} />
              <PrefsCard initial={profile.prefs} demo={demo} />
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
