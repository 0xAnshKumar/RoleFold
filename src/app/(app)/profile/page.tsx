import Link from "next/link";
import a from "@/components/app/app.module.css";
import { getProfile, isDemo } from "@/lib/data";
import { EducationList, Experience, GoalsCard, PrefsCard, ProfileHeader } from "./Edit";
import { Achievements, CareerBreaks, Languages } from "./Sections";
import s from "./profile.module.css";

export default async function ProfilePage() {
  const [{ profile, facts }, demo] = await Promise.all([getProfile(), isDemo()]);
  return (
    <>
      <ProfileHeader initial={{ name: profile.name, headline: profile.headline, location: profile.location, email: profile.email, phone: profile.phone }} demo={demo} />

      {profile.drafts > 0 && (
        <Link href="/onboarding?step=confirm" className={s.queue}>
          <span className={s.queueCount}>{profile.drafts}</span>
          <span>
            <b>{profile.drafts === 1 ? "entry" : "entries"} waiting for you to confirm.</b> They came from your last import. Nothing is used until you confirm it.
          </span>
          <span className={s.queueGo}>Review →</span>
        </Link>
      )}

      <div className={s.layout}>
        <div className={s.main}>
          <Experience roles={profile.roles} projects={profile.projects} facts={facts} confirmed={profile.confirmed} demo={demo} />

          <section className={a.section} aria-labelledby="skills">
            <div className={a.sectionHead}>
              <h2 id="skills" className={a.h2}>
                Skills
              </h2>
              <p className={a.note}>A skill counts in job checks only when a fact proves it.</p>
            </div>
            {profile.skills.length === 0 && <p className={a.note}>None yet. Skills appear here as your confirmed facts prove them.</p>}
            <ul className={s.skills}>
              {profile.skills.map((k) => (
                <li key={k.name} className={k.evidence ? s.skill : `${s.skill} ${s.skillBare}`}>
                  <span>{k.name}</span>
                  <span className={s.skillEv}>{k.evidence ? `${k.evidence} fact${k.evidence > 1 ? "s" : ""}` : "no evidence yet"}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={a.section} aria-labelledby="edu">
            <div className={a.sectionHead}>
              <h2 id="edu" className={a.h2}>
                Education
              </h2>
              <p className={a.note}>Confirm a degree so job checks can count it.</p>
            </div>
            <EducationList initial={profile.education} demo={demo} />
          </section>

          <section className={a.section} aria-labelledby="achievements">
            <div className={a.sectionHead}>
              <h2 id="achievements" className={a.h2}>
                Achievements and publications
              </h2>
              <p className={a.note}>On resumes whose template has an Achievements or Publications section.</p>
            </div>
            <Achievements initial={profile.achievements} demo={demo} />
          </section>

          <section className={a.section} aria-labelledby="languages">
            <div className={a.sectionHead}>
              <h2 id="languages" className={a.h2}>
                Languages
              </h2>
              <p className={a.note}>Kept on your profile. No resume template has a languages section yet.</p>
            </div>
            <Languages initial={profile.languages} demo={demo} />
          </section>

          <section className={a.section} aria-labelledby="breaks">
            <div className={a.sectionHead}>
              <h2 id="breaks" className={a.h2}>
                Career breaks
              </h2>
            </div>
            <CareerBreaks initial={profile.gaps} demo={demo} />
          </section>
        </div>

        <aside className={s.side}>
          <GoalsCard initial={profile.goals} demo={demo} />
          <PrefsCard initial={profile.prefs} demo={demo} />
        </aside>
      </div>
    </>
  );
}
