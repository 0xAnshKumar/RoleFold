"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import s from "./Segmented.module.css";

type Option<T extends string> = { value: T; label: React.ReactNode };

/**
 * Segmented control (theme, responsibility level, Edit/Preview). A native radio group, so arrow keys move the
 * choice; the selected pill slides with transform (DESIGN.md 3.4). Items are equal width and wrap onto a second row
 * when they don't fit (long or Hindi labels on a phone), so the pill is placed from the measured item. Before
 * hydration the selected item draws its own background.
 */
export function Segmented<T extends string>({
  label,
  hideLabel = false,
  options,
  value,
  defaultValue,
  onChange,
  name,
  size = "md",
  className,
}: {
  label: React.ReactNode;
  hideLabel?: boolean;
  options: Option<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (v: T) => void;
  name?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const auto = useId();
  const [inner, setInner] = useState<T | undefined>(defaultValue);
  const current = value ?? inner;
  const i = options.findIndex((o) => o.value === current);
  const track = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = track.current?.querySelectorAll<HTMLElement>("label")[i];
    if (!el) return setBox(null);
    const measure = () => setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track.current!);
    return () => ro.disconnect();
  }, [i]);
  return (
    <fieldset className={`${s.root} ${className ?? ""}`}>
      <legend className={hideLabel ? "sr-only" : s.legend}>{label}</legend>
      <div ref={track} className={`${s.track} ${size === "sm" ? s.sm : ""}`} data-ready={box ? true : undefined}>
        {box && <span className={s.pill} aria-hidden style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }} />}
        {options.map((o) => (
          <label key={o.value} className={s.item}>
            <input
              type="radio"
              className="sr-only"
              name={name ?? auto}
              value={o.value}
              checked={current === o.value}
              onChange={() => {
                setInner(o.value);
                onChange?.(o.value);
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
