"use client";

import a from "@/components/app/app.module.css";
import { download } from "@/lib/api";
import { useAction } from "@/lib/useAction";

/** GET /v1/me/export: a zip of all your data (data.json) plus your resume files, via the header-authenticated
 * download a plain link can't do. */
export default function ExportData({ demo }: { demo: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={demo || !!busy}
        title={demo ? "Sample data can’t be exported" : undefined}
        onClick={() => run("export", () => download("/me/export", "hunt-export.zip"))}
      >
        {busy ? "Preparing…" : "Export all my data"}
      </button>
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </>
  );
}
