import { useMemo } from "react";
import { formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Twelve bars of executed savings per month — hand-rolled SVG (12 points).
 * With a power tariff each bar stacks the energy savings and the month's
 * lower effektavgift.
 */
export function MonthlyChart() {
  const result = useAppStore((s) => s.result);

  const months = useMemo(() => {
    const energy = new Array<number>(12).fill(0);
    const fee = new Array<number>(12).fill(0);
    if (result) {
      for (const d of result.days) energy[d.month - 1] += d.executedSavings;
      for (const m of result.powerFee?.months ?? []) fee[m.month - 1] += m.savings;
    }
    return { energy, fee };
  }, [result]);

  if (!result) return null;
  const hasFee = result.powerFee !== null;

  const W = 560;
  const H = 180;
  const pad = { top: 16, bottom: 22, left: 8, right: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  // Segments stack away from zero in their own sign's direction.
  const up = months.energy.map((e, i) => Math.max(0, e) + Math.max(0, months.fee[i]));
  const down = months.energy.map((e, i) => Math.min(0, e) + Math.min(0, months.fee[i]));
  const max = Math.max(1, ...up, ...down.map((v) => -v));
  const barW = (innerW / 12) * 0.62;
  const baseY = pad.top + innerH;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-medium">Savings per month</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label="Monthly savings bar chart"
      >
        <title>Executed savings per month</title>
        {months.energy.map((e, i) => {
          const f = months.fee[i];
          const x = pad.left + (innerW / 12) * (i + 0.5) - barW / 2;
          const scale = (v: number) => (Math.abs(v) / max) * innerH;
          const label = hasFee
            ? `${formatSek(e + f)} (energy ${formatSek(e)}, effektavgift ${formatSek(f)})`
            : formatSek(e);
          // Energy segment from the zero line; fee segment stacked beyond it.
          const eH = scale(e);
          const eY = e >= 0 ? baseY - eH : baseY;
          const fH = scale(f);
          const fY = f >= 0 ? baseY - scale(Math.max(0, e)) - fH : baseY + scale(Math.min(0, e));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 12-month order
            <g key={i}>
              <title>{label}</title>
              <rect
                x={x}
                y={eY}
                width={barW}
                height={Math.max(1, eH)}
                rx={2}
                className={e >= 0 ? "fill-positive" : "fill-negative"}
                opacity={0.85}
              />
              {Math.abs(f) > 0.5 && (
                <rect
                  x={x}
                  y={fY}
                  width={barW}
                  height={fH}
                  rx={2}
                  className="fill-accent"
                  opacity={0.85}
                />
              )}
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                className="fill-text-muted"
                fontSize={11}
              >
                {MONTHS[i]}
              </text>
            </g>
          );
        })}
      </svg>
      {hasFee && (
        <div className="mt-1 flex gap-4 text-xs text-text-muted">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 bg-positive opacity-85" /> energy
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 bg-accent opacity-85" /> lower
            effektavgift
          </span>
        </div>
      )}
    </div>
  );
}
