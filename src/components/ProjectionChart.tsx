import { useMemo } from "react";
import { yearlySavings } from "../engine/finance";
import { formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

/**
 * Cumulative degradation-aware savings vs the system cost line and the profit
 * the same money would earn in the alternative investment. Hand-rolled SVG.
 */
export function ProjectionChart() {
  const result = useAppStore((s) => s.result);
  const finance = useAppStore((s) => s.finance);
  const battery = useAppStore((s) => s.params.battery);

  const data = useMemo(() => {
    if (!result) return null;
    const years = finance.horizonYears;
    const series = yearlySavings(result.executedSavings, result.executedCycles, battery, years);
    const cumulative: number[] = [0];
    for (const s of series) cumulative.push(cumulative[cumulative.length - 1] + s);
    const fund: number[] = [];
    for (let y = 0; y <= years; y++) {
      fund.push(finance.systemCostSek * ((1 + finance.alternativeReturnRate) ** y - 1));
    }
    return { cumulative, fund, years };
  }, [result, finance, battery]);

  if (!data) return null;

  const W = 560;
  const H = 180;
  const pad = { top: 12, bottom: 22, left: 8, right: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const maxY = Math.max(
    finance.systemCostSek,
    data.cumulative[data.cumulative.length - 1],
    data.fund[data.fund.length - 1],
    1,
  );
  const x = (year: number) => pad.left + (year / data.years) * innerW;
  const y = (v: number) => pad.top + innerH - (v / maxY) * innerH;
  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-medium">Cumulative savings vs alternatives</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label="Projection chart"
      >
        <title>Cumulative savings projection with degradation</title>
        {/* System cost line */}
        <line
          x1={pad.left}
          x2={W - pad.right}
          y1={y(finance.systemCostSek)}
          y2={y(finance.systemCostSek)}
          className="stroke-text-muted"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <text
          x={pad.left + 2}
          y={y(finance.systemCostSek) - 4}
          fontSize={11}
          className="fill-text-muted"
        >
          system cost {formatSek(finance.systemCostSek)}
        </text>
        {/* Alternative investment profit */}
        <path
          d={path(data.fund)}
          fill="none"
          strokeWidth={1.5}
          className="stroke-text-muted"
          strokeDasharray="2 3"
        />
        {/* Battery cumulative savings */}
        <path d={path(data.cumulative)} fill="none" strokeWidth={2} className="stroke-accent" />
        {/* Year ticks */}
        {Array.from({ length: data.years + 1 }, (_, i) => i)
          .filter((i) => i % Math.ceil(data.years / 10) === 0)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={11}
              className="fill-text-muted"
            >
              {i}
            </text>
          ))}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-text-muted">
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 translate-y-[-2px] bg-accent" />
          battery savings
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 translate-y-[-2px] bg-text-muted opacity-70" />
          index fund profit
        </span>
      </div>
    </div>
  );
}
