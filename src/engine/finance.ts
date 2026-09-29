import type { AnnualResult, BatteryParams } from "./types";

/**
 * Investment math, ported from the Python annual summary. One coherent
 * convention throughout: year 1 uses the actually-simulated savings, which
 * already include year 1's degradation; later years scale them by the ratio
 * of that year's average capacity factor to year 1's (scaling by the absolute
 * factor, as the Python projection did, would charge year 1's fade twice).
 * Past EOL the linear degradation continues at the same per-cycle rate,
 * floored at 10% capacity.
 */

export interface FinanceParams {
  systemCostSek: number;
  horizonYears: number;
  /** Discount rate for NPV, e.g. 0.03. */
  discountRate: number;
  /** Expected annual return of the alternative investment, e.g. 0.08. */
  alternativeReturnRate: number;
}

export const DEFAULT_FINANCE: FinanceParams = {
  systemCostSek: 75_000,
  horizonYears: 10,
  discountRate: 0.03,
  alternativeReturnRate: 0.08,
};

const HOURS_PER_YEAR = 8760;

export interface AnnualizedResult {
  /** True when the dataset is not (about) one year, so figures are scaled. */
  scaled: boolean;
  /** Executed days of data behind the figures. */
  days: number;
  /** Savings per year (energy + power fee). */
  annualSavings: number;
  /** Power-fee (effektavgift) part of annualSavings. */
  annualPowerFeeSavings: number;
  /** Full battery cycles per year. */
  annualCycles: number;
  /** No-battery and with-battery cost per year. */
  annualOriginalCost: number;
  annualOptimizedCost: number;
}

/**
 * Per-year figures from a simulation result. Energy totals are scaled by
 * 8760 / executed hours: a full-year dataset needs almost no scaling (the
 * rolling windows leave the first ~13 h unsimulated; a leap year has
 * 8784 h), shorter datasets are extrapolated and longer ones averaged — so a
 * two-year upload never reports two years of savings as one. Power fees are
 * billed per calendar month, so they scale by 12 / months covered instead
 * (exactly the monthly bills for a one-year dataset). `scaled` flags
 * datasets that are clearly not one year, for labeling.
 */
export function annualize(result: AnnualResult): AnnualizedResult {
  const hours = result.executedHours;
  const scaled = hours < 8000 || hours > 9000;
  const energyFactor = hours > 0 ? HOURS_PER_YEAR / hours : 1;
  const fee = result.powerFee;
  const feeFactor = fee && fee.months.length > 0 ? 12 / fee.months.length : 1;
  const baselineFee = fee?.baselineFee ?? 0;
  const optimizedFee = fee?.optimizedFee ?? 0;
  const annualOriginalCost =
    (result.executedOriginalCost - baselineFee) * energyFactor + baselineFee * feeFactor;
  const annualOptimizedCost =
    (result.executedOptimizedCost - optimizedFee) * energyFactor + optimizedFee * feeFactor;
  return {
    scaled,
    days: Math.round(hours / 24),
    annualSavings: annualOriginalCost - annualOptimizedCost,
    annualPowerFeeSavings: (baselineFee - optimizedFee) * feeFactor,
    annualCycles: result.executedCycles * energyFactor,
    annualOriginalCost,
    annualOptimizedCost,
  };
}

/** Capacity factor at a cycle count, continuing past EOL, floored at 0.1. */
export function projectedCapacityFactor(cycles: number, battery: BatteryParams): number {
  const eol = battery.eolCapacityPercent / 100;
  const perCycle = (1 - eol) / battery.cyclesToEol;
  return Math.max(0.1, 1 - perCycle * cycles);
}

/**
 * Savings per year for `years` years. Year 1 is the simulated actual; year y
 * scales it by the average capacity factor between cycle counts (y−1)·c and
 * y·c, relative to year 1's average (0 → c), whose fade the simulation
 * already includes.
 */
export function yearlySavings(
  simulatedAnnualSavings: number,
  cyclesPerYear: number,
  battery: BatteryParams,
  years: number,
): number[] {
  const avgFactor = (y: number) =>
    (projectedCapacityFactor((y - 1) * cyclesPerYear, battery) +
      projectedCapacityFactor(y * cyclesPerYear, battery)) /
    2;
  const year1 = avgFactor(1);
  const series: number[] = [];
  for (let y = 1; y <= years; y++) {
    series.push(y === 1 ? simulatedAnnualSavings : (simulatedAnnualSavings * avgFactor(y)) / year1);
  }
  return series;
}

export interface InvestmentAnalysis {
  /** Years until cumulative savings cover the system cost; null if beyond 40. */
  paybackYears: number | null;
  /** Cumulative savings over the horizon. */
  horizonSavings: number;
  /** (horizonSavings − cost) as percent of cost. */
  roiPct: number;
  /** Net present value of the savings stream minus the upfront cost. */
  npv: number;
  /** Profit the same money would earn in the alternative investment. */
  alternativeProfit: number;
}

/** Compound profit of the alternative investment after `years` years. */
export function alternativeProfitOver(years: number, finance: FinanceParams): number {
  return finance.systemCostSek * ((1 + finance.alternativeReturnRate) ** years - 1);
}

export function analyzeInvestment(
  simulatedAnnualSavings: number,
  cyclesPerYear: number,
  battery: BatteryParams,
  finance: FinanceParams,
): InvestmentAnalysis {
  const MAX_PAYBACK_YEARS = 40;
  const long = yearlySavings(simulatedAnnualSavings, cyclesPerYear, battery, MAX_PAYBACK_YEARS);
  const horizon = long.slice(0, finance.horizonYears);

  let paybackYears: number | null = null;
  let cumulative = 0;
  for (let y = 0; y < long.length; y++) {
    const prev = cumulative;
    cumulative += long[y];
    if (cumulative >= finance.systemCostSek) {
      paybackYears = long[y] > 0 ? y + (finance.systemCostSek - prev) / long[y] : y + 1;
      break;
    }
  }

  const horizonSavings = horizon.reduce((s, x) => s + x, 0);
  const npv =
    -finance.systemCostSek +
    horizon.reduce((s, x, i) => s + x / (1 + finance.discountRate) ** (i + 1), 0);
  const alternativeProfit =
    finance.systemCostSek * (1 + finance.alternativeReturnRate) ** finance.horizonYears -
    finance.systemCostSek;

  return {
    paybackYears,
    horizonSavings,
    roiPct: ((horizonSavings - finance.systemCostSek) / finance.systemCostSek) * 100,
    npv,
    alternativeProfit,
  };
}
