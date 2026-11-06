"use client";

import a from "@/components/app/app.module.css";
import { Button } from "@/components/ui/Button";
import { download } from "@/lib/api";
import { useAction } from "@/lib/useAction";

/** GET /v1/me/export: a zip of all your data (data.json) plus your resume files, via the header-authenticated
 * download a plain link can't do. */
export default function ExportData({ demo }: { demo: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <>
      <Button
        size="sm"
        disabled={demo}
        loading={!!busy}
        aria-describedby={demo ? "export-demo" : undefined}
        onClick={() => run("export", () => download("/me/export", "hunt-export.zip"))}
      >
        Download
      </Button>
      {demo && (
        <span id="export-demo" className="sr-only">
          Sample data can’t be exported
        </span>
      )}
      {error && (
        <p role="alert" className={a.problem}>
          {error}
        </p>
      )}
    </>
  );
}
