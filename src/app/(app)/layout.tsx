import { Suspense } from "react";
import { Providers } from "@/app/providers";
import s from "@/components/app/app.module.css";
import { ActiveNav, AppNav } from "@/components/shell/AppNav";
import { ToastProvider } from "@/components/ui/Toast";
import { getProfile, isDemo } from "@/lib/data";

async function LiveNav() {
  // The badge is a nicety: if the profile can't load, the page itself shows the error.
  const [demo, p] = await Promise.all([isDemo(), getProfile().catch(() => null)]);
  const user = p ? { name: p.profile.name || "You", email: p.profile.email || undefined } : null;
  return <ActiveNav demo={demo} queue={p?.profile.drafts ?? 0} signOut={!demo && !!process.env.OIDC_ISSUER} user={user} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <ToastProvider>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Suspense fallback={<AppNav path="" />}>
          <LiveNav />
        </Suspense>
        <main id="main" tabIndex={-1} className={s.page}>
          {children}
        </main>
      </ToastProvider>
    </Providers>
  );
}
