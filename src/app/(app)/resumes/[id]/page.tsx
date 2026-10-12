import { notFound } from "next/navigation";
import PageHeader from "@/components/app/PageHeader";
import { getProfile, getResume, isDemo } from "@/lib/data";
import Editor from "./Editor";

export default async function ResumePage({ params }: PageProps<"/resumes/[id]">) {
  const { id } = await params;
  const [resume, { facts, profile }, demo] = await Promise.all([getResume(id), getProfile(), isDemo()]);
  if (!resume) notFound();

  return (
    <>
      <PageHeader
        title="Every line, with its proof."
        context={resume.target}
        sub="Tap or hover a line to see the fact it came from. Edit freely; every change is checked against that fact before you can download."
      />
      {/* Names aren't stored on resumes yet: the profile name stands in. */}
      <Editor resume={{ ...resume, name: resume.name || profile.name || "Your name" }} facts={facts} demo={demo} />
    </>
  );
}
