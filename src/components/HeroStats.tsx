import { useMemo } from "react";
import { analyzeInvestment } from "../engine/finance";
import { formatPercent, formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

function Tile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "";
  return (
    <div className="bg-surface p-4">
      <div className="text-sm text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

export function HeroStats() {
  const result = useAppStore((s) => s.result);
  const finance = useAppStore((s) => s.finance);
  const battery = useAppStore((s) => s.params.battery);

  // Datasets shorter than a year are annualized for the yearly figures and
  // the finance math — clearly labeled, since seasons may be unbalanced.
  const scaled = useMemo(() => {
    if (!result) return null;
    const executedHours = result.days.reduce((s, d) => s + d.executedHours, 0);
    const partial = executedHours < 8000;
    const factor = partial ? 8760 / executedHours : 1;
    return {
      partial,
      days: Math.round(executedHours / 24),
      annualSavings: result.executedSavings * factor,
      annualCycles: result.executedCycles * factor,
    };
  }, [result]);

  const analysis = useMemo(
    () =>
      scaled
        ? analyzeInvestment(scaled.annualSavings, scaled.annualCycles, battery, finance)
        : null,
    [scaled, battery, finance],
  );

  if (!result || !analysis || !scaled) return null;

  const net = analysis.horizonSavings - finance.systemCostSek;
  const paybackTone =
    analysis.paybackYears === null
      ? "negative"
      : analysis.paybackYears <= finance.horizonYears
        ? "positive"
        : "default";

  return (
    <section aria-label="Headline results">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        <Tile
          label={scaled.partial ? "Annual savings (annualized)" : "Annual savings"}
          value={`${formatSek(scaled.annualSavings)}/yr`}
          sub={
            scaled.partial
              ? `extrapolated from ${scaled.days} days of data`
              : `${formatPercent(result.executedSavingsPct)} of the no-battery cost`
          }
          tone={scaled.annualSavings > 0 ? "positive" : "negative"}
        />
        <Tile
          label="Payback"
          value={
            analysis.paybackYears === null ? "never" : `${analysis.paybackYears.toFixed(1)} yr`
          }
          sub={`at ${formatSek(finance.systemCostSek)} system cost`}
          tone={paybackTone}
        />
        <Tile
          label={`${finance.horizonYears}-yr net result`}
          value={formatSek(net)}
          sub={`index fund instead: +${formatSek(analysis.alternativeProfit)}`}
          tone={net >= 0 ? "positive" : "negative"}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        These figures are the battery's <em>added</em> value: the same household would pay{" "}
        {formatSek(result.executedOriginalCost)}
        {scaled.partial ? ` over the ${scaled.days} analyzed days` : "/yr"} without a battery and{" "}
        {formatSek(result.executedOptimizedCost)} with one, under the current market model. Changing
        the model (e.g. selling solar) moves both bills — the tiles show only their difference,
        which is what the battery investment buys.
      </p>
    </section>
  );
}
