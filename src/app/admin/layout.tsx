import type { Metadata } from "next";
import { Suspense } from "react";
import a from "@/components/app/app.module.css";
import { isDemo } from "@/lib/data";
import AdminNav from "./AdminNav";

export const metadata: Metadata = { title: "Admin · Hunt", robots: { index: false } };

async function LiveOnly({ children }: { children: React.ReactNode }) {
  if (!(await isDemo())) return children;
  return (
    <div className={a.empty} role="status" style={{ marginTop: "var(--s-xl)" }}>
      <p className="margin-note">The admin console needs the live API.</p>
      <p className={a.note}>This is sample data, so there are no queues, users or audit entries to show.</p>
    </div>
  );
}

// src/proxy.ts makes sure there is a session; the API decides who is an admin (403 for everyone else).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      <main className={a.page}>
        <Suspense fallback={<p className={a.note}>Loading…</p>}>
          <LiveOnly>{children}</LiveOnly>
        </Suspense>
      </main>
    </>
  );
}
