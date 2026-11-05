import type { Metadata } from "next";
import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import { getUsage, isDemo } from "@/lib/data";
import DeleteAccount from "./DeleteAccount";
import ExportData from "./ExportData";
import s from "./settings.module.css";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [usage, demo] = await Promise.all([getUsage(), isDemo()]);
  const METERS = [
    { label: "Tailored resumes", ...usage.tailored },
    { label: "Detailed job checks", ...usage.matches },
  ];
  return (
    <>
      <PageHeader title="Settings" sub="Your plan, your data, and how we reach you." />

      <div className={s.grid}>
        <section className={`${a.card} ${s.block}`} aria-labelledby="plan">
          <div className={s.blockHead}>
            <h2 id="plan" className={a.h2}>
              Free plan
            </h2>
            <p className={a.note}>Resets {usage.resetsOn}</p>
          </div>
          {METERS.map((m) => (
            <div key={m.label} className={a.meter}>
              <div className={a.meterTop}>
                <span>{m.label}</span>
                <span>
                  {m.used} of {m.limit} used
                </span>
              </div>
              <div className={a.meterTrack}>
                <span className={a.meterFill} style={{ width: `${Math.min(100, (m.used / m.limit) * 100)}%` }} />
              </div>
            </div>
          ))}
          <ul className={s.always}>
            <li>Master resumes, PDF and Word downloads: always free</li>
            <li>A resume you’ve already made can always be downloaded</li>
            <li>We tell you before you reach a limit, never after</li>
          </ul>
        </section>

        <section className={`${a.card} ${s.block}`} aria-labelledby="notify">
          <h2 id="notify" className={a.h2}>
            Email
          </h2>
          <label className={s.toggle}>
            <input type="checkbox" defaultChecked />
            <span>
              <b>Account and security emails</b>
              <span className={a.note}>Sign-in links and new-device alerts. Required.</span>
            </span>
          </label>
          <label className={s.toggle}>
            <input type="checkbox" />
            <span>
              <b>Product updates</b>
              <span className={a.note}>A short note when something new ships. Off unless you turn it on.</span>
            </span>
          </label>
        </section>

        <section className={`${a.card} ${s.block}`} aria-labelledby="data">
          <h2 id="data" className={a.h2}>
            Your data
          </h2>
          <p className={a.note}>
            Download everything: your profile, every fact and version, your resumes and the files you uploaded.
          </p>
          <ExportData demo={demo} />
        </section>

        <section className={`${s.block} ${s.danger}`} aria-labelledby="delete">
          <h2 id="delete" className={a.h2}>
            Delete your account
          </h2>
          <p>
            This removes your profile, resumes, uploads and job checks. You’ll see two dates: when everything is gone from
            our live systems, and when it’s purged from backups (within 30 days).
          </p>
          <DeleteAccount demo={demo} />
        </section>
      </div>
    </>
  );
}
