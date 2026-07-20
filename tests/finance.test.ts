import { describe, expect, it } from "vitest";
import { analyzeInvestment, DEFAULT_FINANCE } from "../src/engine/finance";
import { DEFAULT_PARAMS } from "../src/engine/types";

describe("investment analysis", () => {
  const battery = DEFAULT_PARAMS.battery;

  it("index-fund payback-equivalent is ln2/ln(1+r)", () => {
    const a = analyzeInvestment(4000, 300, battery, DEFAULT_FINANCE);
    // 8% default: money doubles in ~9.0 years
    expect(a.alternativePaybackYears).toBeCloseTo(Math.log(2) / Math.log(1.08), 10);
    expect(a.alternativePaybackYears).toBeGreaterThan(8.9);
    expect(a.alternativePaybackYears).toBeLessThan(9.1);
  });

  it("index-fund payback-equivalent is null at zero return", () => {
    const a = analyzeInvestment(4000, 300, battery, {
      ...DEFAULT_FINANCE,
      alternativeReturnRate: 0,
    });
    expect(a.alternativePaybackYears).toBeNull();
    expect(a.alternativeProfit).toBe(0);
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
