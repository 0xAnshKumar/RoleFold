"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import s from "./Nav.module.css";

const ITEMS = [
  { href: "/jobs", label: "Jobs", match: "/jobs", icon: "M3 7h14v9H3zM7 7V4h6v3" },
  { href: "/resumes", label: "Resumes", match: "/resumes", icon: "M5 2h7l3 3v13H5zM8 9h5M8 12h5M8 15h3" },
  { href: "/profile", label: "Profile", match: "/profile", icon: "M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 18c1-3.5 4-5 7-5s6 1.5 7 5" },
  { href: "/settings", label: "Settings", match: "/settings", icon: "M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M4 4l1.8 1.8M14.2 14.2 16 16M4 16l1.8-1.8M14.2 5.8 16 4" },
] as const;

// The pathname is request data on dynamic routes, so the static shell renders links with none active.
function Links({ path }: { path: string }) {
  return ITEMS.map((i) => (
    <Link key={i.href} href={i.href} className={s.link} aria-current={path.startsWith(i.match) ? "page" : undefined}>
      <svg viewBox="0 0 20 20" className={s.icon} aria-hidden>
        <path d={i.icon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{i.label}</span>
    </Link>
  ));
}
const ActiveLinks = () => <Links path={usePathname()} />;

export default function Nav({ demo = false, queue = 0, signOut = false }: { demo?: boolean; queue?: number; signOut?: boolean }) {
  return (
    <header className={s.bar}>
      <Link href="/" className={s.brand}>
        Hunt
      </Link>
      <nav aria-label="Main" className={s.nav}>
        <Suspense fallback={<Links path="" />}>
          <ActiveLinks />
        </Suspense>
      </nav>
      <div className={s.right}>
        {demo && (
          <span className={s.sample} title="The API isn’t connected, so you’re seeing an example profile. Nothing you do here is saved.">
            Sample data
          </span>
        )}
        {queue > 0 && (
          <Link href="/onboarding?step=confirm" className={s.queue}>
            <span className={s.dot} aria-hidden />
            {queue} {queue === 1 ? "entry" : "entries"} to confirm
          </Link>
        )}
        {demo && (
          <span className={s.avatar} aria-label="Signed in as Rohan Iyer (sample)">
            RI
          </span>
        )}
        {signOut && (
          // POST so a link prefetch can never sign anyone out.
          <form action="/auth/logout" method="post">
            <button type="submit" className="btn btn-secondary btn-small">
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
