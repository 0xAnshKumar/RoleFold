import s from "./Choice.module.css";

// Checkbox, radio and switch are native inputs (DESIGN.md 3.4): styled natively, 44px row hit area.

type ChoiceProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: React.ReactNode; helper?: React.ReactNode; ref?: React.Ref<HTMLInputElement> };

function Row({ type, label, helper, className, ...rest }: ChoiceProps & { type: "checkbox" | "radio" }) {
  return (
    <label className={`${s.row} ${className ?? ""}`} data-disabled={rest.disabled || undefined}>
      <input {...rest} type={type} className={s.box} />
      <span className={s.text}>
        {label}
        {helper && <span className={s.helper}>{helper}</span>}
      </span>
    </label>
  );
}

export const Checkbox = (p: ChoiceProps) => <Row {...p} type="checkbox" />;
export const Radio = (p: ChoiceProps) => <Row {...p} type="radio" />;

/** On/off setting that applies at once. A native checkbox with role="switch": works in plain forms too. */
export function Switch({ label, helper, className, ...rest }: ChoiceProps) {
  return (
    <label className={`${s.row} ${s.switchRow} ${className ?? ""}`} data-disabled={rest.disabled || undefined}>
      <span className={s.text}>
        {label}
        {helper && <span className={s.helper}>{helper}</span>}
      </span>
      <input {...rest} type="checkbox" role="switch" className={s.switch} />
    </label>
  );
}
