import type { Metadata } from "next";
import Taxonomy from "./Taxonomy";

export const metadata: Metadata = { title: "Skill terms" };
// The admin layout drops this page in demo mode, and the client component loads per-admin data after mount.
export const instant = false;

export default function Page() {
  return <Taxonomy />;
}
