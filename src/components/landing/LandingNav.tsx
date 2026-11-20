"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import s from "./landing.module.css";

const SECTIONS = [
  ["#modules", "What it does"],
  ["#how", "How it works"],
  ["#who", "Who it’s for"],
  ["#pricing", "Pricing"],
  ["#faq", "FAQ"],
] as const;

/**
 * Floating glass bar (DESIGN.md 3.2). Fixed; nothing about it changes with scroll. Below 1024px the bar itself grows
 * into the menu: main goes inert, the page stops scrolling, Esc or the button closes it.
 */
export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const main = document.getElementById("main");
    main?.setAttribute("inert", "");
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => {
      main?.removeAttribute("inert");
      document.documentElement.style.overflow = "";
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={s.navWrap}>
      <nav aria-label="Main" className={`${s.nav} rim`} data-open={open || undefined}>
        <div className={s.navBar}>
          <Link href="/" className={s.wordmark}>
            RoleFold
          </Link>
          <ul className={s.navLinks}>
            {SECTIONS.map(([href, label]) => (
              <li key={href}>
                <a href={href} className={s.navLink}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <Link href="/signin" className={`${s.navLink} ${s.signIn}`}>
            Sign in
          </Link>
          <ButtonLink href="/onboarding" variant="primary" size="sm" className={s.navCta}>
            Build my resume
          </ButtonLink>
          <button
            ref={btn}
            type="button"
            className={s.menuBtn}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen(!open)}
          >
            <span className="sr-only">Menu</span>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path className={s.menuTop} d="M4 8h16" />
              <path className={s.menuBottom} d="M4 16h16" />
            </svg>
          </button>
        </div>
        <div id="landing-menu" className={s.menu} inert={!open}>
          <div className={s.menuInner}>
            <ul className={s.menuLinks}>
              {SECTIONS.map(([href, label]) => (
                <li key={href}>
                  <a href={href} className={s.menuLink} onClick={() => setOpen(false)}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <div className={s.menuActions}>
              <ButtonLink href="/signin" variant="secondary">
                Sign in
              </ButtonLink>
              <ButtonLink href="/onboarding" variant="primary">
                Build my resume
              </ButtonLink>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
