import { type ReactNode, useId, useState } from "react";

export function HelpButton({
  open,
  onClick,
  controls,
  subject,
}: {
  open: boolean;
  onClick: () => void;
  controls: string;
  subject: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`Explain ${subject}`}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none transition-colors ${
        open
          ? "border-accent bg-accent text-white"
          : "border-border text-text-muted hover:border-accent hover:text-accent"
      }`}
    >
      ?
    </button>
  );
}

export function HelpText({
  id,
  open,
  children,
}: {
  id: string;
  open: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <p
      id={id}
      className="mt-1.5 rounded-md bg-surface-2 p-2 text-xs leading-relaxed text-text-muted"
    >
      {children}
    </p>
  );
}

export interface ParamFieldProps {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Detailed plain-language explanation, revealed by the ? button. */
  help: string;
  onChange: (value: number) => void;
}

/** Slider paired with a numeric input and an expandable explanation. */
export function ParamField({
  label,
  unit,
  value,
  min,
  max,
  step,
  help,
  onChange,
}: ParamFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <label htmlFor={id} className="text-[13px] text-text-muted">
            {label}
          </label>
          <HelpButton
            open={open}
            onClick={() => setOpen(!open)}
            controls={`${id}-help`}
            subject={label}
          />
        </span>
        <span className="flex items-baseline gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => commit(e.target.value)}
            className="w-20 rounded-md border border-border bg-surface px-1.5 py-0.5 text-right text-[13px] tabular-nums focus:border-accent focus:outline-none"
            aria-label={`${label} value`}
          />
          {unit && <span className="text-xs text-text-muted">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => commit(e.target.value)}
        className="mt-1 w-full accent-accent"
      />
      <HelpText id={`${id}-help`} open={open}>
        {help}
      </HelpText>
    </div>
  );
}

/** Label + help toggle wrapper for non-slider controls (selects). */
export function LabeledField({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-[13px] text-text-muted">
          {label}
        </label>
        <HelpButton
          open={open}
          onClick={() => setOpen(!open)}
          controls={`${id}-help`}
          subject={label}
        />
      </div>
      {children}
      <HelpText id={`${id}-help`} open={open}>
        {help}
      </HelpText>
    </div>
  );
}
