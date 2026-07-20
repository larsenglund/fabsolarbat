import type { BatteryParams } from "./types";

/**
 * Investment math, ported from the Python annual summary. One coherent
 * convention throughout (the Python payback loop scaled year 1 while its
 * projection table did not; we standardize on the projection-table behavior):
 * year 1 uses the actually-simulated savings (which already include intra-year
 * degradation); later years scale by that year's average capacity factor.
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

/** Capacity factor at a cycle count, continuing past EOL, floored at 0.1. */
export function projectedCapacityFactor(cycles: number, battery: BatteryParams): number {
  const eol = battery.eolCapacityPercent / 100;
  const perCycle = (1 - eol) / battery.cyclesToEol;
  return Math.max(0.1, 1 - perCycle * cycles);
}

/**
 * Savings per year for `years` years. Year 1 is the simulated actual; year y
 * scales it by the average capacity factor between cycle counts (y−1)·c and y·c.
 */
export function yearlySavings(
  simulatedAnnualSavings: number,
  cyclesPerYear: number,
  battery: BatteryParams,
  years: number,
): number[] {
  const series: number[] = [];
  for (let y = 1; y <= years; y++) {
    if (y === 1) {
      series.push(simulatedAnnualSavings);
    } else {
      const start = projectedCapacityFactor((y - 1) * cyclesPerYear, battery);
      const end = projectedCapacityFactor(y * cyclesPerYear, battery);
      series.push((simulatedAnnualSavings * (start + end)) / 2);
    }
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
  /**
   * Payback-equivalent for the alternative investment: years until its
   * compound profit matches the invested amount (i.e. the money doubles),
   * ln 2 / ln(1+r). Directly comparable to paybackYears. Null if r ≤ 0.
   */
  alternativePaybackYears: number | null;
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
    alternativePaybackYears:
      finance.alternativeReturnRate > 0
        ? Math.log(2) / Math.log(1 + finance.alternativeReturnRate)
        : null,
  };
}
