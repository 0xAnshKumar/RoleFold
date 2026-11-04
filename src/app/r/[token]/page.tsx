import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import ResumePaper from "@/components/resume/ResumePaper";
import { ApiError } from "@/lib/api";
import { getShared } from "@/lib/data";
import { TEMPLATES } from "@/lib/templates";
import s from "./shared.module.css";

// Outside the (app) group, so src/proxy.ts never sends viewers to sign in. Never indexed, and the token never
// leaves in a Referer header.
export const metadata: Metadata = { title: "Resume — shared through Hunt", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharedResumePage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const forwardedFor = (await headers()).get("x-forwarded-for") ?? "";
  const shared = await getShared(token, forwardedFor).catch((e) => (e instanceof ApiError && e.status === 429 ? "busy" : Promise.reject(e)));
  if (shared === "busy")
    return (
      <main className={s.page}>
        <p role="alert">Too many requests from your network just now. Try again in a minute.</p>
      </main>
    );
  if (!shared) notFound();

  const template = TEMPLATES.find((t) => t.id === shared.templateId) ?? TEMPLATES[0];
  const resume = {
    id: "",
    target: "",
    template: template.name,
    name: shared.name || "Resume",
    sections: shared.sections.map((sec) => ({ ...sec, lines: sec.lines.map((l) => ({ ...l, factId: "" })) })),
  };
  return (
    <main className={s.page}>
      <div className={s.sheet}>
        <ResumePaper resume={resume} template={template} extras={shared.extras} />
      </div>
      <p className={s.foot}>
        A read-only copy, shared by its owner through <Link href="/">Hunt</Link>.
      </p>
    </main>
  );
}
