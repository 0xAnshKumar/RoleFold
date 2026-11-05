import type { Metadata } from "next";
import Audit from "./Audit";

export const metadata: Metadata = { title: "Audit log" };
// The admin layout drops this page in demo mode, and the client component loads per-admin data after mount.
export const instant = false;

export default function Page() {
  return <Audit />;
}
