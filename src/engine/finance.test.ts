import { describe, expect, it } from "vitest";
import { analyzeInvestment, projectedCapacityFactor, yearlySavings } from "./finance";
import { DEFAULT_PARAMS } from "./types";

const battery = DEFAULT_PARAMS.battery; // 6000 cycles → 70%, i.e. 0.005%/cycle

describe("projectedCapacityFactor", () => {
  it("degrades linearly to EOL and keeps going, floored at 10%", () => {
    expect(projectedCapacityFactor(0, battery)).toBe(1);
    expect(projectedCapacityFactor(3000, battery)).toBeCloseTo(0.85, 12);
    expect(projectedCapacityFactor(6000, battery)).toBeCloseTo(0.7, 12);
    expect(projectedCapacityFactor(12000, battery)).toBeCloseTo(0.4, 12);
    expect(projectedCapacityFactor(1_000_000, battery)).toBe(0.1);
  });
});

describe("yearlySavings", () => {
  it("uses actual savings for year 1 and scales later years by avg capacity", () => {
    const series = yearlySavings(1000, 500, battery, 3);
    expect(series[0]).toBe(1000);
    // Year 2: cycles 500→1000, factors 0.975 and 0.95, avg 0.9625
    expect(series[1]).toBeCloseTo(962.5, 9);
    // Year 3: cycles 1000→1500, factors 0.95 and 0.925, avg 0.9375
    expect(series[2]).toBeCloseTo(937.5, 9);
  });
});

describe("analyzeInvestment", () => {
  it("computes payback with fractional interpolation", () => {
    // 1000/yr (ignoring degradation ≈), cost 2500 → payback between year 2 and 3.
    const a = analyzeInvestment(1000, 0, battery, {
      systemCostSek: 2500,
      horizonYears: 10,
      discountRate: 0.03,
      alternativeReturnRate: 0.08,
    });
    // With 0 cycles/year there is no degradation: exactly 2.5 years.
    expect(a.paybackYears).toBeCloseTo(2.5, 9);
    expect(a.horizonSavings).toBeCloseTo(10_000, 9);
    expect(a.roiPct).toBeCloseTo(300, 9);
    // NPV: -2500 + Σ 1000/1.03^y for y=1..10
    let npv = -2500;
    for (let y = 1; y <= 10; y++) npv += 1000 / 1.03 ** y;
    expect(a.npv).toBeCloseTo(npv, 9);
    expect(a.alternativeProfit).toBeCloseTo(2500 * 1.08 ** 10 - 2500, 9);
  });

  it("returns null payback when savings never cover the cost", () => {
    const a = analyzeInvestment(100, 500, battery, {
      systemCostSek: 1_000_000,
      horizonYears: 10,
      discountRate: 0.03,
      alternativeReturnRate: 0.08,
    });
    expect(a.paybackYears).toBeNull();
    expect(a.npv).toBeLessThan(0);
  });
});
