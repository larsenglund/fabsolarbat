import { describe, expect, it } from "vitest";
import { alternativeProfitOver, analyzeInvestment, DEFAULT_FINANCE } from "../src/engine/finance";
import { DEFAULT_PARAMS } from "../src/engine/types";

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
