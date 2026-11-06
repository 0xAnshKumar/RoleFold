import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/app/PageHeader";
import { ProgressBar } from "@/components/ui/Progress";
import { getProfile, getUsage, isDemo } from "@/lib/data";
import DeleteAccount from "./DeleteAccount";
import ExportData from "./ExportData";
import ThemeSetting from "./ThemeSetting";
import s from "./settings.module.css";

export const metadata: Metadata = { title: "Settings" };

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className={s.group} aria-labelledby={id}>
      <h2 id={id} className={s.groupTitle}>
        {title}
      </h2>
      <div className={`${s.card} rim`}>{children}</div>
    </section>
  );
}

/** Settings (DESIGN.md 4.8): one narrow column of grouped rows, from the avatar menu. */
export default async function SettingsPage() {
  const [usage, demo, { profile }] = await Promise.all([getUsage(), isDemo(), getProfile()]);
  const meters = [...(usage.tailored ? [{ label: "Tailored resumes", ...usage.tailored }] : []), { label: "Job checks", ...usage.matches }];
  const signOut = !demo && !!process.env.OIDC_ISSUER;
  return (
    <div className={s.page}>
      <PageHeader title="Settings" sub="Your account, how Hunt looks, your plan and your data." />

      <Group id="account" title="Account">
        <div className={s.row}>
          <span className={s.key}>Name</span>
          <span className={s.value}>{profile.name || "Not set yet"}</span>
          <Link href="/profile" className={s.edit}>
            Edit<span className="sr-only"> your name on your profile</span>
          </Link>
        </div>
        <div className={s.row}>
          <span className={s.key}>Email</span>
          <span className={s.value}>{profile.email || "Not set yet"}</span>
          <Link href="/profile" className={s.edit}>
            Edit<span className="sr-only"> your email on your profile</span>
          </Link>
        </div>
        {signOut && (
          <form action="/auth/logout" method="post" className={s.row}>
            <span className={s.key}>Signed in</span>
            <button type="submit" className={s.edit}>
              Sign out
            </button>
          </form>
        )}
      </Group>

      <Group id="appearance" title="Appearance">
        <div className={s.row}>
          <ThemeSetting />
        </div>
      </Group>

      <Group id="alerts" title="Job alerts">
        <div className={s.row}>
          <span className={s.key}>Email me new matches</span>
          <Link href="/jobs?settings=1" className={s.edit}>
            Feed settings
          </Link>
        </div>
      </Group>

      <Group id="plan" title="Free plan">
        <div className={s.stack}>
          {meters.map((m) => (
            <ProgressBar key={m.label} value={m.used} max={m.limit} label={`${m.label}: ${m.used} of ${m.limit} used this month`} />
          ))}
          <p className={s.muted}>Resets {usage.resetsOn}. Re-checking a job after you update your profile is free.</p>
          <ul className={s.always}>
            <li>Master resumes, PDF and Word downloads are always free.</li>
            <li>A resume you’ve already made can always be downloaded.</li>
            <li>We tell you before you reach a limit, never after.</li>
          </ul>
        </div>
      </Group>

      <Group id="data" title="Your data">
        <div className={s.row}>
          <span className={s.text}>
            <span className={s.key}>Download everything</span>
            <span className={s.muted}>Your profile, every fact and version, your resumes and the files you uploaded.</span>
          </span>
          <ExportData demo={demo} />
        </div>
        <div className={s.row}>
          <span className={s.text}>
            <span className={s.key}>Delete my account and data</span>
            <span className={s.muted}>Removes your profile, resumes, uploads and job checks. Purged from backups within 30 days.</span>
          </span>
          <DeleteAccount demo={demo} />
        </div>
      </Group>
    </div>
  );
}
