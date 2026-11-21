"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import type { Usage } from "@/lib/mock";
import PasteJob from "./PasteJob";

type Panel = "paste";

/** Page-header action on /jobs: "Paste a job" (dialog). `open` comes from ?paste=1, so the nav and other pages can link here. */
export default function JobsActions({ demo, usage, open }: { demo: boolean; usage: Usage; open: Panel | null }) {
  const router = useRouter();
  const [local, setLocal] = useState<Panel | "closed" | null>(null);
  // A new ?paste link wins over whatever was opened or closed here before.
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
      router.replace(u.pathname + u.search, { scroll: false });
    }
  };

  return (
    <>
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

    </>
  );
}
