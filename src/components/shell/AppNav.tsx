"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Badge } from "@/components/ui/Status";
import { useTheme, type ThemePref } from "./theme";
import s from "./AppNav.module.css";

export type NavUser = { name: string; email?: string } | null;
type NavProps = { demo?: boolean; queue?: number; signOut?: boolean; user?: NavUser };
type Panel = "jobs" | "account";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/jobs", label: "Jobs", icon: "jobs" },
  { href: "/resumes", label: "Resume", icon: "resume" },
  { href: "/profile", label: "Profile", icon: "profile" },
];
const BAR_H = 56;
const fine = () => matchMedia("(hover: hover)").matches;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function Account({ user, demo, signOut, onNavigate }: NavProps & { onNavigate: () => void }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className={s.account}>
      {user && (
        <div className={s.who}>
          <span className={s.whoName}>
            {user.name}
            {demo && " (sample)"}
          </span>
          {user.email && <span className={s.whoEmail}>{user.email}</span>}
        </div>
      )}
      <Link href="/settings" className={s.row} onClick={onNavigate}>
        <Icon name="settings" />
        Settings
      </Link>
      <Segmented<ThemePref>
        label="Theme"
        size="sm"
        value={theme}
        onChange={setTheme}
        options={[
          { value: "light", label: "Light" },
          { value: "night", label: "Night" },
          { value: "system", label: "System" },
        ]}
        className={s.theme}
      />
      {signOut && (
        // POST so a link prefetch can never sign anyone out.
        <form action="/auth/logout" method="post">
          <button type="submit" className={s.row}>
            <Icon name="signOut" />
            Sign out
          </button>
        </form>
      )}
    </div>
  );
}

/** Reads the pathname for aria-current. Render inside Suspense; the fallback is <AppNav path="" />. */
export function ActiveNav(p: NavProps) {
  return <AppNav {...p} path={usePathname()} />;
}

/**
 * App shell navigation (DESIGN.md 3.1). Desktop (≥1024): a floating bar whose plate grows down in place into the
 * Jobs or Account panel (disclosure pattern, not role="menu"). Phone/tablet: a compact top bar that scrolls away, a
 * bottom tab bar, and the account panel as a bottom sheet.
 */
export function AppNav({ demo = false, queue = 0, signOut = false, user = null, path }: NavProps & { path: string }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const [plateH, setPlateH] = useState(BAR_H);
  const [sheet, setSheet] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const jobsPanel = useRef<HTMLDivElement>(null);
  const accountPanel = useRef<HTMLDivElement>(null);
  const jobsBtn = useRef<HTMLButtonElement>(null);
  const accountBtn = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (p: Panel | null) => {
    clearTimeout(timer.current);
    setOpen(p);
    setPlateH(p ? BAR_H + ((p === "jobs" ? jobsPanel : accountPanel).current?.offsetHeight ?? 0) : BAR_H);
  };
  const later = (p: Panel | null, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => show(p), ms);
  };

  // Close on navigation (state reset during render, not in an effect), Esc (focus back to the trigger) and a press
  // outside the bar.
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setOpen(null);
    setPlateH(BAR_H);
  }
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      (open === "jobs" ? jobsBtn : accountBtn).current?.focus();
      show(null);
    };
    const down = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) show(null);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const hoverOpen = (p: Panel, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && fine()) later(p, 120); // intent delay
  };
  const hoverCancel = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && !open) clearTimeout(timer.current);
  };
  const toggle = (p: Panel) => show(open === p ? null : p);
  const here = (href: string) => path === href || path.startsWith(`${href}/`);
  const dim = (p: Panel | "other") => (open && open !== p ? true : undefined);
  const ini = user ? initials(user.name) : "?";
  // Visible initials stay in the accessible name (WCAG 2.5.3 label in name).
  const accountName = <span className="sr-only">, account{user ? ` for ${user.name}` : ""}</span>;
  const queueLabel = `${queue} ${queue === 1 ? "entry" : "entries"} to confirm`;
  const sample = demo && (
    <span className={s.sample}>
      Sample data
      <span className="sr-only">: the API isn’t connected, so you’re seeing an example profile. Nothing you do here is saved.</span>
    </span>
  );

  return (
    <>
      {/* desktop */}
      <header className={s.strip}>
        <div
          ref={bar}
          className={s.bar}
          data-open={open || undefined}
          onPointerLeave={(e) => e.pointerType === "mouse" && open && later(null, 200)}
          onPointerEnter={(e) => e.pointerType === "mouse" && open && clearTimeout(timer.current)}
        >
          <span className={`${s.plate} rim`} style={{ height: plateH }} aria-hidden />
          <div className={s.row1}>
            <Link href="/jobs" className={s.wordmark}>
              Hunt
            </Link>
            <nav aria-label="Main" className={s.items}>
              <span className={s.split} data-dim={dim("jobs")} onPointerEnter={(e) => hoverOpen("jobs", e)} onPointerLeave={hoverCancel}>
                <Link href="/jobs" className={s.item} aria-current={here("/jobs") ? "page" : undefined}>
                  Jobs
                </Link>
                <button
                  ref={jobsBtn}
                  type="button"
                  className={s.disclose}
                  aria-expanded={open === "jobs"}
                  aria-controls="nav-panel-jobs"
                  aria-label="Jobs sections"
                  onClick={() => toggle("jobs")}
                >
                  <Icon name="chevronDown" size={16} />
                </button>
                {/* panels sit right after their trigger in DOM order, so Tab reaches them next */}
                <div ref={jobsPanel} id="nav-panel-jobs" className={s.panel} data-active={open === "jobs" || undefined}>
                  <div className={s.tiles}>
                    <Link href="/jobs" className={s.tile} onClick={() => show(null)}>
                      <span className={s.tileTitle}>For you</span>
                      <span className={s.tileText}>Real jobs ranked to the skills you confirmed</span>
                    </Link>
                    <Link href="/jobs?tab=saved" className={s.tile} onClick={() => show(null)}>
                      <span className={s.tileTitle}>Saved &amp; pasted</span>
                      <span className={s.tileText}>Jobs you saved or pasted yourself, with their checks</span>
                    </Link>
                  </div>
                  <div className={s.links}>
                    <Link href="/jobs?tab=saved&paste=1" className={s.row} onClick={() => show(null)}>
                      Paste a job
                      <Icon name="arrowRight" size={16} />
                    </Link>
                    <Link href="/jobs?settings=1" className={s.row} onClick={() => show(null)}>
                      Feed settings
                      <Icon name="arrowRight" size={16} />
                    </Link>
                  </div>
                </div>
              </span>
              {ITEMS.slice(1).map((i) => (
                <Link key={i.href} href={i.href} className={s.item} data-dim={dim("other")} aria-current={here(i.href) ? "page" : undefined}>
                  {i.label}
                </Link>
              ))}
            </nav>
            <div className={s.right} data-dim={dim("other")}>
              {sample}
              {queue > 0 && (
                <Link href="/onboarding?step=confirm" className={s.queue}>
                  <Badge dot>{queueLabel}</Badge>
                </Link>
              )}
            </div>
            <button
              ref={accountBtn}
              type="button"
              className={s.avatarBtn}
              data-dim={dim("account")}
              aria-expanded={open === "account"}
              aria-controls="nav-panel-account"
              onClick={() => toggle("account")}
              onPointerEnter={(e) => hoverOpen("account", e)}
              onPointerLeave={hoverCancel}
            >
              <span className={s.avatar}>{ini}</span>
              {accountName}
              <Icon name="chevronDown" size={16} />
            </button>
            <div ref={accountPanel} id="nav-panel-account" className={`${s.panel} ${s.panelEnd}`} data-active={open === "account" || undefined}>
              <Account user={user} demo={demo} signOut={signOut} onNavigate={() => show(null)} />
            </div>
          </div>
        </div>
      </header>

      {/* phone and tablet */}
      <header className={s.top}>
        <Link href="/jobs" className={s.wordmark}>
          Hunt
        </Link>
        <div className={s.right}>
          {sample}
          {queue > 0 && (
            <Link href="/onboarding?step=confirm" className={s.queue}>
              <Badge dot>
                {queue} to confirm<span className="sr-only"> ({queue === 1 ? "entry" : "entries"} from your import)</span>
              </Badge>
            </Link>
          )}
          <button type="button" className={s.avatarBtn} aria-haspopup="dialog" onClick={() => setSheet(true)}>
            <span className={s.avatar}>{ini}</span>
            {accountName}
          </button>
        </div>
      </header>
      <nav aria-label="Main" className={s.tabbar}>
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className={s.tab} aria-current={here(i.href) ? "page" : undefined}>
            <Icon name={i.icon} size={24} />
            <span>{i.label}</span>
          </Link>
        ))}
      </nav>
      <Dialog open={sheet} onClose={() => setSheet(false)} title="Account" variant="sheet">
        <Account user={user} demo={demo} signOut={signOut} onNavigate={() => setSheet(false)} />
      </Dialog>
    </>
  );
}
