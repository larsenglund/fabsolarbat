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

  const analysis = useMemo(
    () =>
      result
        ? analyzeInvestment(result.executedSavings, result.executedCycles, battery, finance)
        : null,
    [result, battery, finance],
  );

  if (!result || !analysis) return null;

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
          label="Annual savings"
          value={`${formatSek(result.executedSavings)}/yr`}
          sub={`${formatPercent(result.executedSavingsPct)} of the no-battery cost`}
          tone={result.executedSavings > 0 ? "positive" : "negative"}
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
        {formatSek(result.executedOriginalCost)}/yr without a battery and{" "}
        {formatSek(result.executedOptimizedCost)}/yr with one, under the current market model.
        Changing the model (e.g. selling solar) moves both bills — the tiles show only their
        difference, which is what the battery investment buys.
      </p>
    </section>
  );
}
