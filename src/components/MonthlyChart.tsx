import { useMemo } from "react";
import { formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Twelve bars of executed savings per month — hand-rolled SVG (12 points). */
export function MonthlyChart() {
  const result = useAppStore((s) => s.result);

  const months = useMemo(() => {
    const sums = new Array(12).fill(0);
    if (result) for (const d of result.days) sums[d.month - 1] += d.executedSavings;
    return sums as number[];
  }, [result]);

  if (!result) return null;

  const W = 560;
  const H = 180;
  const pad = { top: 16, bottom: 22, left: 8, right: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...months.map((v) => Math.abs(v)));
  const barW = (innerW / 12) * 0.62;

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
        {months.map((v, i) => {
          const x = pad.left + (innerW / 12) * (i + 0.5) - barW / 2;
          const h = (Math.abs(v) / max) * innerH;
          const y = v >= 0 ? pad.top + innerH - h : pad.top + innerH;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 12-month order
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                rx={2}
                className={v >= 0 ? "fill-positive" : "fill-negative"}
                opacity={0.85}
              >
                <title>{`${formatSek(v)}`}</title>
              </rect>
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
    </div>
  );
}
