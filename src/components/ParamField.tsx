export interface ParamFieldProps {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (value: number) => void;
}

/** Slider paired with a numeric input, per DESIGN.md's parameter controls. */
export function ParamField({
  label,
  unit,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: ParamFieldProps) {
  const id = `param-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <div className="py-1.5" title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] text-text-muted">
          {label}
        </label>
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
    </div>
  );
}
