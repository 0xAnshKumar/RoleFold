"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "@/components/Nav.module.css";

const ITEMS = [
  { href: "/admin", label: "Operations" },
  { href: "/admin/support", label: "Support access" },
  { href: "/admin/taxonomy", label: "Skill terms" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

/** The app's top bar, with the console's sections instead of the user's. */
export default function AdminNav() {
  const path = usePathname();
  return (
    <header className={s.bar}>
      <Link href="/admin" className={s.brand}>
        Hunt admin
      </Link>
      <nav aria-label="Admin" className={s.nav}>
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className={s.link} aria-current={path === i.href ? "page" : undefined}>
            {i.label}
          </Link>
        ))}
      </nav>
      <div className={s.right}>
        <Link href="/jobs" className="btn btn-secondary btn-small">
          Back to the app
        </Link>
      </div>
    </header>
  );
}
