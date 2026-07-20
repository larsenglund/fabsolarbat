import { useMemo } from "react";
import { alternativeProfitOver, analyzeInvestment, type FinanceParams } from "../engine/finance";
import type { AnnualResult, BatteryParams } from "../engine/types";
import { formatPercent, formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

/**
 * Annualized headline figures for one result under one scenario. Datasets
 * shorter than a year are annualized (factor 8760/executedHours) for the
 * yearly figures and the finance math — clearly labeled, since seasons may
 * be unbalanced.
 */
function scenarioFigures(result: AnnualResult, battery: BatteryParams, finance: FinanceParams) {
  const executedHours = result.days.reduce((s, d) => s + d.executedHours, 0);
  const partial = executedHours < 8000;
  const factor = partial ? 8760 / executedHours : 1;
  const annualSavings = result.executedSavings * factor;
  const annualCycles = result.executedCycles * factor;
  const analysis = analyzeInvestment(annualSavings, annualCycles, battery, finance);
  return {
    partial,
    days: Math.round(executedHours / 24),
    annualSavings,
    analysis,
    net: analysis.horizonSavings - finance.systemCostSek,
  };
}

interface Delta {
  text: string;
  tone: "positive" | "negative" | "default";
}

/** Format a signed SEK delta, e.g. +412 kr. */
function sekDelta(diff: number, suffix = ""): string {
  return `${diff >= 0 ? "+" : ""}${formatSek(diff)}${suffix}`;
}

function Tile({
  label,
  value,
  sub,
  tone = "default",
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative";
  delta?: Delta;
}) {
  const toneClass = (t: string) =>
    t === "positive" ? "text-positive" : t === "negative" ? "text-negative" : "";
  return (
    <div className="bg-surface p-4">
      <div className="text-sm text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${toneClass(tone)}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
      {delta && (
        <div className={`mt-0.5 text-xs tabular-nums ${toneClass(delta.tone)}`}>
          {delta.text} vs baseline
        </div>
      )}
    </div>
  );
}

export function HeroStats() {
  const result = useAppStore((s) => s.result);
  const finance = useAppStore((s) => s.finance);
  const battery = useAppStore((s) => s.params.battery);
  const baseline = useAppStore((s) => s.baseline);

  const current = useMemo(
    () => (result ? scenarioFigures(result, battery, finance) : null),
    [result, battery, finance],
  );
  const pinned = useMemo(
    () =>
      baseline ? scenarioFigures(baseline.result, baseline.params.battery, baseline.finance) : null,
    [baseline],
  );

  if (!result || !current) return null;
  const { analysis } = current;

  const paybackTone =
    analysis.paybackYears === null
      ? "negative"
      : analysis.paybackYears <= finance.horizonYears
        ? "positive"
        : "default";

  // Deltas are current − baseline; for payback, lower is better.
  let deltas: { savings: Delta; payback: Delta; net: Delta } | undefined;
  if (pinned) {
    const dSavings = current.annualSavings - pinned.annualSavings;
    const dNet = current.net - pinned.net;
    const cp = analysis.paybackYears;
    const bp = pinned.analysis.paybackYears;
    let payback: Delta;
    if (cp === null && bp === null) {
      payback = { text: "±0 yr", tone: "default" };
    } else if (cp === null) {
      payback = { text: `was ${bp?.toFixed(1)} yr`, tone: "negative" };
    } else if (bp === null) {
      payback = { text: "was never", tone: "positive" };
    } else {
      const d = cp - bp;
      payback = {
        text: `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} yr`,
        tone: Math.abs(d) < 0.05 ? "default" : d < 0 ? "positive" : "negative",
      };
    }
    deltas = {
      savings: {
        text: `${sekDelta(dSavings, "/yr")}`,
        tone: Math.abs(dSavings) < 0.5 ? "default" : dSavings > 0 ? "positive" : "negative",
      },
      payback,
      net: {
        text: sekDelta(dNet),
        tone: Math.abs(dNet) < 0.5 ? "default" : dNet > 0 ? "positive" : "negative",
      },
    };
  }

  return (
    <section aria-label="Headline results">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        <Tile
          label={current.partial ? "Annual savings (annualized)" : "Annual savings"}
          value={`${formatSek(current.annualSavings)}/yr`}
          sub={
            current.partial
              ? `extrapolated from ${current.days} days of data`
              : `${formatPercent(result.executedSavingsPct)} of the no-battery cost`
          }
          tone={current.annualSavings > 0 ? "positive" : "negative"}
          delta={deltas?.savings}
        />
        <Tile
          label="Payback"
          value={
            analysis.paybackYears === null ? "never" : `${analysis.paybackYears.toFixed(1)} yr`
          }
          sub={`at ${formatSek(finance.systemCostSek)} system cost${
            analysis.paybackYears !== null
              ? ` · index fund earns +${formatSek(alternativeProfitOver(analysis.paybackYears, finance))} in that time`
              : ""
          }`}
          tone={paybackTone}
          delta={deltas?.payback}
        />
        <Tile
          label={`${finance.horizonYears}-yr net result`}
          value={formatSek(current.net)}
          sub={`index fund instead: +${formatSek(analysis.alternativeProfit)}`}
          tone={current.net >= 0 ? "positive" : "negative"}
          delta={deltas?.net}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        These figures are the battery's <em>added</em> value: the same household would pay{" "}
        {formatSek(result.executedOriginalCost)}
        {current.partial ? ` over the ${current.days} analyzed days` : "/yr"} without a battery and{" "}
        {formatSek(result.executedOptimizedCost)} with one, under the current market model. Changing
        the model (e.g. selling solar) moves both bills — the tiles show only their difference,
        which is what the battery investment buys.
      </p>
    </section>
  );
}
