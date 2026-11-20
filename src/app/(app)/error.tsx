"use client";

import a from "@/components/app/app.module.css";

// Server errors arrive redacted in production, so the copy is plain and general.
export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className={a.empty} role="alert" style={{ marginTop: "var(--s-3xl)" }}>
      <p className="margin-note">We couldn’t load this page.</p>
      <p className={a.note}>RoleFold didn’t answer just now. Nothing you saved is affected. Try again in a moment.</p>
      <button type="button" className="btn btn-secondary btn-small" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
