"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import s from "./Tabs.module.css";

// Tabs (DESIGN.md 3.16): t-label, 44 tall, a 2px accent underline that slides (translateX + scaleX, 200ms).
// Before hydration each active tab draws its own static underline, so nothing is missing on first paint.

function useIndicator(active: number) {
  const list = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = list.current?.querySelectorAll<HTMLElement>("[data-tab]")[active];
    if (!el) return;
    const measure = () => setBox({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list.current!);
    return () => ro.disconnect();
  }, [active]);
  const bar = box && <span className={s.bar} aria-hidden style={{ transform: `translateX(${box.x}px) scaleX(${box.w})` }} />;
  return { list, bar, ready: !!box };
}

/** Tabs that change the URL: links with aria-current, not ARIA tabs. */
export function TabLinks({ label, items, className }: { label: string; items: { href: string; label: React.ReactNode; current: boolean }[]; className?: string }) {
  const { list, bar, ready } = useIndicator(Math.max(0, items.findIndex((i) => i.current)));
  return (
    <nav aria-label={label} className={className}>
      <div ref={list} className={s.list} data-ready={ready || undefined}>
        {items.map((i, n) => (
          <Link key={n} href={i.href} data-tab className={s.tab} aria-current={i.current ? "page" : undefined} scroll={false}>
            {i.label}
          </Link>
        ))}
        {bar}
      </div>
    </nav>
  );
}

/** In-page ARIA tabs (WAI-ARIA APG, automatic activation): arrow keys, Home and End move between tabs. */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  defaultValue,
  onChange,
  className,
}: {
  label: string;
  tabs: { value: T; label: React.ReactNode; panel: React.ReactNode }[];
  value?: T;
  defaultValue?: T;
  onChange?: (v: T) => void;
  className?: string;
}) {
  const base = useId();
  const [inner, setInner] = useState<T>(defaultValue ?? tabs[0].value);
  const current = value ?? inner;
  const active = Math.max(0, tabs.findIndex((t) => t.value === current));
  const { list, bar, ready } = useIndicator(active);
  const select = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    setInner(t.value);
    onChange?.(t.value);
    list.current?.querySelectorAll<HTMLElement>("[role=tab]")[(i + tabs.length) % tabs.length]?.focus();
  };
  return (
    <div className={className}>
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        className={s.list}
        data-ready={ready || undefined}
        onKeyDown={(e) => {
          const k = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: tabs.length - 1 }[e.key];
          if (k === undefined) return;
          e.preventDefault();
          select(k);
        }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            data-tab
            id={`${base}-t${i}`}
            aria-controls={`${base}-p${i}`}
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            className={s.tab}
            onClick={() => select(i)}
          >
            {t.label}
          </button>
        ))}
        {bar}
      </div>
      {tabs.map((t, i) => (
        <div key={t.value} role="tabpanel" id={`${base}-p${i}`} aria-labelledby={`${base}-t${i}`} hidden={i !== active} tabIndex={0} className={s.panel}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}
