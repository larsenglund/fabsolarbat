import { describe, expect, it } from "vitest";
import {
  alternativeProfitOver,
  analyzeInvestment,
  annualize,
  DEFAULT_FINANCE,
} from "../src/engine/finance";
import { type AnnualResult, DEFAULT_PARAMS, type PowerFeeMonth } from "../src/engine/types";

/** Just the fields annualize() reads. */
function fakeResult(
  hours: number,
  energy: { original: number; optimized: number },
  feeMonths: { baseline: number; optimized: number }[] = [],
): AnnualResult {
  const months = feeMonths.map(
    (m, i) =>
      ({
        monthKey: i,
        month: (i % 12) + 1,
        baselineFee: m.baseline,
        optimizedFee: m.optimized,
      }) as PowerFeeMonth,
  );
  const baselineFee = feeMonths.reduce((s, m) => s + m.baseline, 0);
  const optimizedFee = feeMonths.reduce((s, m) => s + m.optimized, 0);
  return {
    executedHours: hours,
    executedCycles: hours / 26,
    executedOriginalCost: energy.original + baselineFee,
    executedOptimizedCost: energy.optimized + optimizedFee,
    executedSavings: energy.original + baselineFee - energy.optimized - optimizedFee,
    powerFee:
      months.length > 0
        ? {
            tariffId: "fev-2025",
            months,
            baselineFee,
            optimizedFee,
            savings: baselineFee - optimizedFee,
          }
        : null,
  } as AnnualResult;
}

describe("annualize", () => {
  it("scales energy by 8760 h: two years average, half a year extrapolates", () => {
    const twoYears = annualize(fakeResult(17_520, { original: 50_000, optimized: 42_000 }));
    expect(twoYears.scaled).toBe(true);
    expect(twoYears.annualSavings).toBeCloseTo(4000, 9);
    expect(twoYears.annualCycles).toBeCloseTo(17_520 / 26 / 2, 9);
    const half = annualize(fakeResult(4380, { original: 12_000, optimized: 10_000 }));
    expect(half.scaled).toBe(true);
    expect(half.annualSavings).toBeCloseTo(4000, 9);
  });

  it("takes a full year almost as-is and power-fee bills per month", () => {
    const fee = Array.from({ length: 12 }, () => ({ baseline: 300, optimized: 200 }));
    const year = annualize(fakeResult(8770, { original: 25_000, optimized: 21_000 }, fee));
    expect(year.scaled).toBe(false);
    // 12 monthly bills: taken exactly; energy: × 8760/8770.
    expect(year.annualPowerFeeSavings).toBeCloseTo(1200, 9);
    expect(year.annualSavings).toBeCloseTo(4000 * (8760 / 8770) + 1200, 9);
    expect(year.annualOriginalCost).toBeCloseTo(25_000 * (8760 / 8770) + 3600, 9);
    // 24 monthly bills over two years average to one year's.
    const two = annualize(
      fakeResult(17_520, { original: 50_000, optimized: 42_000 }, [...fee, ...fee]),
    );
    expect(two.annualPowerFeeSavings).toBeCloseTo(1200, 9);
  });
});

describe("investment analysis", () => {
  const battery = DEFAULT_PARAMS.battery;

  it("index-fund profit over a period compounds from the system cost", () => {
    // 75 000 kr at 8% over 10 years: 75 000 · (1.08^10 − 1) ≈ 86 919 kr
    expect(alternativeProfitOver(10, DEFAULT_FINANCE)).toBeCloseTo(75_000 * (1.08 ** 10 - 1), 6);
    // At the doubling time (ln2/ln1.08 ≈ 9 yr) the profit equals the cost.
    expect(alternativeProfitOver(Math.log(2) / Math.log(1.08), DEFAULT_FINANCE)).toBeCloseTo(
      75_000,
      6,
    );
  });

  it("index-fund profit is zero at zero return or zero time", () => {
    expect(alternativeProfitOver(10, { ...DEFAULT_FINANCE, alternativeReturnRate: 0 })).toBe(0);
    expect(alternativeProfitOver(0, DEFAULT_FINANCE)).toBe(0);
  });

  it("battery payback without degradation is cost/savings", () => {
    // A battery that never degrades: zero cycles per year.
    const a = analyzeInvestment(7500, 0, battery, { ...DEFAULT_FINANCE, systemCostSek: 75_000 });
    expect(a.paybackYears).toBeCloseTo(10, 5);
  });

  it("payback is null when savings never reach the cost", () => {
    const a = analyzeInvestment(100, 300, battery, DEFAULT_FINANCE);
    expect(a.paybackYears).toBeNull();
  });
});
