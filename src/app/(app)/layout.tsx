import { Suspense } from "react";
import Nav from "@/components/Nav";
import s from "@/components/app/app.module.css";
import { getProfile, isDemo } from "@/lib/data";

async function LiveNav() {
  // The chip is a nicety: if the profile can't load, the page itself shows the error.
  const [demo, p] = await Promise.all([isDemo(), getProfile().catch(() => null)]);
  return <Nav demo={demo} queue={p?.profile.drafts ?? 0} signOut={!demo && !!process.env.OIDC_ISSUER} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* rubber-stamp ink texture shared by stamps and seals */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="stamp-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.55" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" />
        </filter>
      </svg>
      <Suspense fallback={<Nav />}>
        <LiveNav />
      </Suspense>
      <main className={s.page}>{children}</main>
    </>
  );
}
