"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerFilled";
export type ButtonSize = "sm" | "md" | "lg";

/** Class list for anything that should look like a button (e.g. a <Link>). */
export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) =>
  [s.btn, s[variant], s[size], extra].filter(Boolean).join(" ");

/** Spinner appears only after 150ms and then stays at least 400ms, so fast actions never flash (DESIGN.md 3.0). */
function useSpinner(loading: boolean) {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (loading && !shown) {
      const t = setTimeout(() => {
        since.current = Date.now();
        setShown(true);
      }, 150);
      return () => clearTimeout(t);
    }
    if (!loading && shown) {
      const t = setTimeout(() => setShown(false), Math.max(0, 400 - (Date.now() - since.current)));
      return () => clearTimeout(t);
    }
  }, [loading, shown]);
  return shown;
}

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rendered as aria-disabled so it stays focusable; point aria-describedby at the visible reason. */
  disabled?: boolean;
  icon?: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
};

export function Button({ variant = "secondary", size = "md", loading = false, disabled = false, icon, className, children, onClick, type = "button", ...rest }: Props) {
  const spin = useSpinner(loading);
  const inert = disabled || loading;
  return (
    <button
      {...rest}
      type={type}
      className={buttonClass(variant, size, className)}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      data-spin={spin || undefined}
      onClick={(e) => {
        if (inert) return e.preventDefault(); // also blocks form submit
        onClick?.(e);
      }}
    >
      <span className={s.label}>
        {icon}
        {children}
      </span>
      {spin && <span className={`spinner ${s.spinner}`} aria-hidden />}
    </button>
  );
}

export function ButtonLink({ variant = "secondary", size = "md", className, ...rest }: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}

/** Square icon button: always named, with a tooltip on hover and focus. */
export function IconButton({ label, icon, variant = "ghost", className, tip = true, ...rest }: Omit<Props, "children" | "size"> & { label: string; icon: React.ReactNode; tip?: boolean }) {
  return (
    <span className={s.tipWrap}>
      <Button {...rest} variant={variant} className={`${s.icon} ${className ?? ""}`} aria-label={label}>
        {icon}
      </Button>
      {tip && (
        <span className={s.tip} aria-hidden>
          {label}
        </span>
      )}
    </span>
  );
}
