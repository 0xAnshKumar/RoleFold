"use client";

import { useId, useState } from "react";
import { Icon } from "./Icon";
import s from "./Disclosure.module.css";

/**
 * Disclosure (DESIGN.md 3.16): a button with aria-expanded and a region that opens with grid rows 0fr → 1fr.
 * Closed content is inert, so it is out of the tab order and the accessibility tree.
 */
export function Disclosure({
  summary,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const id = useId();
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  return (
    <div className={`${s.root} ${className ?? ""}`} data-open={isOpen || undefined}>
      <button
        type="button"
        className={s.summary}
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => {
          setInner(!isOpen);
          onOpenChange?.(!isOpen);
        }}
      >
        <span className={s.summaryText}>{summary}</span>
        <Icon name="chevronDown" size={20} className={s.chevron} />
      </button>
      <div id={id} className={s.region} inert={!isOpen}>
        <div className={s.inner}>
          <div className={s.pad}>{children}</div>
        </div>
      </div>
    </div>
  );
}
