import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProfile, getResume, getShare, isDemo } from "@/lib/data";
import Editor from "./Editor";
import Share from "./Share";

export const metadata: Metadata = { title: "Resume editor" };

export default async function ResumePage({ params }: PageProps<"/resumes/[id]">) {
  const { id } = await params;
  // The share panel is optional: if its state can't load, the editor still shows.
  const [resume, { facts, profile }, demo, share] = await Promise.all([getResume(id), getProfile(), isDemo(), getShare(id).catch(() => null)]);
  if (!resume) notFound();

  return (
    // Names aren't stored on resumes yet: the profile name stands in.
    <Editor
      resume={{ ...resume, name: resume.name || profile.name || "Your name" }}
      facts={facts}
      demo={demo}
      share={share && <Share resumeId={resume.id} initial={share} contact={{ location: profile.location ?? "", email: profile.email ?? "", phone: profile.phone ?? "" }} demo={demo} />}
    />
  );
}
