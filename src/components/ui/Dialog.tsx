"use client";

import { useEffect, useId, useRef } from "react";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import s from "./Dialog.module.css";

export type DialogVariant = "dialog" | "wide" | "drawer" | "sheet";

/**
 * Dialog, drawer and bottom sheet on native <dialog> + showModal() (DESIGN.md 3.15): focus trap, Esc and the top
 * layer come free, and focus returns to the trigger on close. "drawer" is a right panel from 600px and a bottom sheet
 * below it; "sheet" is always a bottom sheet. Clicking the scrim closes. Enter/exit are CSS (@starting-style).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  variant = "dialog",
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  variant?: DialogVariant;
  /** Actions. Desktop: right-aligned; phone: full width, stacked with the primary (last) on top. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  const panel = variant === "drawer" || variant === "sheet";
  return (
    <dialog
      ref={ref}
      className={`${s.dialog} ${s[variant]} ${className ?? ""}`}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // the scrim
      }}
    >
      <div className={s.box}>
        {panel && <span className={s.grabber} aria-hidden />}
        <div className={s.head}>
          <h2 id={`${id}-t`} className={s.title}>
            {title}
          </h2>
          {panel && <IconButton label="Close" icon={<Icon name="close" />} onClick={onClose} tip={false} className={s.close} />}
        </div>
        {description && (
          <p id={`${id}-d`} className={s.desc}>
            {description}
          </p>
        )}
        {children && <div className={s.body}>{children}</div>}
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </dialog>
  );
}
