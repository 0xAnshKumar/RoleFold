import { useId } from "react";
import { Icon } from "./Icon";
import s from "./Field.module.css";

// Text input, textarea and native select with a visible label above, optional helper and error below (DESIGN.md 3.4).
// No floating labels and no placeholder-as-label. Errors set aria-invalid and are wired with aria-describedby.

type FieldOwn = { label: React.ReactNode; helper?: React.ReactNode; error?: React.ReactNode; hideLabel?: boolean; className?: string };

function useFieldIds(id: string | undefined, helper: unknown, error: unknown, describedBy?: string) {
  const auto = useId();
  const fid = id ?? auto;
  const help = helper ? `${fid}-help` : "";
  const err = error ? `${fid}-err` : "";
  return { fid, help, err, describedBy: [err, help, describedBy].filter(Boolean).join(" ") || undefined };
}

function Frame({ fid, label, hideLabel, help, helper, err, error, className, children }: FieldOwn & { fid: string; help: string; err: string; children: React.ReactNode }) {
  return (
    <div className={`${s.field} ${className ?? ""}`}>
      <label htmlFor={fid} className={hideLabel ? "sr-only" : s.label}>
        {label}
      </label>
      {children}
      {helper && (
        <p id={help} className={s.helper}>
          {helper}
        </p>
      )}
      {error && (
        <p id={err} className={s.error}>
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = FieldOwn & Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> & { prefix?: string; suffix?: string; ref?: React.Ref<HTMLInputElement> };

/** Text input. `prefix`/`suffix` render fixed segments like "+91", "₹" and "LPA". */
export function Input({ label, helper, error, hideLabel, className, prefix, suffix, id, ...rest }: InputProps) {
  const { fid, help, err, describedBy } = useFieldIds(id, helper, error, rest["aria-describedby"]);
  const input = <input {...rest} id={fid} className={s.input} aria-invalid={error ? true : rest["aria-invalid"]} aria-describedby={describedBy} />;
  return (
    <Frame {...{ fid, label, hideLabel, help, helper, err, error, className }}>
      {prefix || suffix ? (
        <div className={s.affixed} data-invalid={error ? true : undefined}>
          {prefix && (
            <span className={s.affix} aria-hidden>
              {prefix}
            </span>
          )}
          {input}
          {suffix && (
            <span className={s.affix} aria-hidden>
              {suffix}
            </span>
          )}
        </div>
      ) : (
        input
      )}
    </Frame>
  );
}

export function Textarea({ label, helper, error, hideLabel, className, id, rows = 3, ...rest }: FieldOwn & React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  const { fid, help, err, describedBy } = useFieldIds(id, helper, error, rest["aria-describedby"]);
  return (
    <Frame {...{ fid, label, hideLabel, help, helper, err, error, className }}>
      <textarea {...rest} rows={rows} id={fid} className={s.textarea} aria-invalid={error ? true : rest["aria-invalid"]} aria-describedby={describedBy} />
    </Frame>
  );
}

export function Select({ label, helper, error, hideLabel, className, id, children, ...rest }: FieldOwn & React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: React.Ref<HTMLSelectElement> }) {
  const { fid, help, err, describedBy } = useFieldIds(id, helper, error, rest["aria-describedby"]);
  return (
    <Frame {...{ fid, label, hideLabel, help, helper, err, error, className }}>
      <div className={s.selectWrap}>
        <select {...rest} id={fid} className={s.select} aria-invalid={error ? true : rest["aria-invalid"]} aria-describedby={describedBy}>
          {children}
        </select>
        <Icon name="chevronDown" size={18} className={s.chevron} />
      </div>
    </Frame>
  );
}
