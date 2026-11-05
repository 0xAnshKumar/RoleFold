import type { Metadata } from "next";
import Support from "./Support";

export const metadata: Metadata = { title: "Support access" };
// The admin layout drops this page in demo mode, and the client component loads per-admin data after mount.
export const instant = false;

export default function Page() {
  return <Support />;
}
