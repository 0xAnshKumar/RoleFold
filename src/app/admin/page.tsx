import type { Metadata } from "next";
import Ops from "./Ops";

// The layout template only applies to child segments, so this page spells out its full title.
export const metadata: Metadata = { title: { absolute: "Operations · Admin — RoleFold" } };
// The admin layout drops this page in demo mode, and the client component loads per-admin data after mount.
export const instant = false;

export default function Page() {
  return <Ops />;
}
