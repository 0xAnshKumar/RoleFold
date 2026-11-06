"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import type { Feed, Usage } from "@/lib/mock";
import PasteJob from "./PasteJob";
import { AlertSettings, Learned } from "./Side";
import s from "./jobs.module.css";

type Panel = "paste" | "settings";

/**
 * Page-header actions on /jobs: "Paste a job" (dialog) and "Feed settings" (drawer with alerts, what feedback changed
 * and where jobs come from: DESIGN.md 4.5). `open` comes from ?paste=1 / ?settings=1, so the nav and other pages can link here.
 */
export default function JobsActions({ demo, usage, settings, open }: { demo: boolean; usage: Usage; settings: Pick<Feed, "alerts" | "learned"> | null; open: Panel | null }) {
  const router = useRouter();
  const [local, setLocal] = useState<Panel | "closed" | null>(null);
  // A new ?paste / ?settings link wins over whatever was opened or closed here before.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setLocal(null);
  }
  const shown = local === "closed" ? null : (local ?? open);
  const close = () => {
    setLocal("closed");
    if (open) {
      const u = new URL(window.location.href);
      u.searchParams.delete("paste");
      u.searchParams.delete("settings");
      router.replace(u.pathname + u.search, { scroll: false });
    }
  };

  return (
    <>
      {settings && (
        <Button icon={<Icon name="settings" size={18} />} onClick={() => setLocal("settings")}>
          Feed settings
        </Button>
      )}
      <Button variant="primary" icon={<Icon name="plus" size={18} />} onClick={() => setLocal("paste")}>
        Paste a job
      </Button>

      <Dialog
        open={shown === "paste"}
        onClose={close}
        variant="wide"
        title="Paste a job"
        description="Copy the whole posting from the company site, Naukri, LinkedIn or an email. We read only the text you paste and never open links."
      >
        <PasteJob demo={demo} usage={usage} />
      </Dialog>

      {settings && (
        <Dialog open={shown === "settings"} onClose={close} variant="drawer" title="Feed settings">
          <div className={s.drawer}>
            <AlertSettings initial={settings.alerts} demo={demo} />
            <Learned initial={settings.learned} demo={demo} />
            <section className={s.drawerSection} aria-labelledby="sources-title">
              <h3 id="sources-title" className={s.drawerTitle}>
                Where these jobs come from
              </h3>
              <p className={a.note}>
                Public job boards that companies publish for sharing their openings. We never scrape sites, and you always apply on the
                company’s own page. Jobs that ask for fees or ID documents are left out.
              </p>
            </section>
          </div>
        </Dialog>
      )}
    </>
  );
}
