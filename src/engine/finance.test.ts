import { describe, expect, it } from "vitest";
import {
  analyzeInvestment,
  projectedCapacityFactor,
  savingsMultiplier,
  yearlySavings,
} from "./finance";
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
    // Year 1 already ran at avg capacity (1 + 0.975)/2 = 0.9875.
    // Year 2: cycles 500→1000, factors 0.975 and 0.95, avg 0.9625
    expect(series[1]).toBeCloseTo((1000 * 0.9625) / 0.9875, 9);
    // Year 3: cycles 1000→1500, factors 0.95 and 0.925, avg 0.9375
    expect(series[2]).toBeCloseTo((1000 * 0.9375) / 0.9875, 9);
  });
});

describe("capacity sensitivity", () => {
  // Measured: at 70% capacity the battery keeps 82% of the savings it made
  // at year 1's average capacity of 0.99.
  const sens = { referenceFactor: 0.99, reducedFactor: 0.7, reducedSavingsRatio: 0.82 };

  it("follows the measured line, extended past it and floored at zero", () => {
    expect(savingsMultiplier(0.99, 0.99, sens)).toBeCloseTo(1, 12);
    expect(savingsMultiplier(0.7, 0.99, sens)).toBeCloseTo(0.82, 12);
    // Halfway in capacity → halfway in savings.
    expect(savingsMultiplier(0.845, 0.99, sens)).toBeCloseTo(0.91, 12);
    // Below the measured point the same slope continues…
    expect(savingsMultiplier(0.41, 0.99, sens)).toBeCloseTo(0.64, 12);
    // …but savings never turn negative.
    expect(savingsMultiplier(-10, 0.99, sens)).toBe(0);
  });

  it("falls back to proportional scaling without a measurement", () => {
    expect(savingsMultiplier(0.9, 0.99, null)).toBeCloseTo(0.9 / 0.99, 12);
  });

  it("projects later years along the measured line", () => {
    // 500 cycles/yr: year 2 averages capacity 0.9625 (see yearlySavings above).
    const series = yearlySavings(1000, 500, battery, 2, sens);
    expect(series[1]).toBeCloseTo(1000 * (1 - ((0.99 - 0.9625) * 0.18) / 0.29), 9);
    // Much gentler than proportional scaling (≈ 974.7).
    expect(series[1]).toBeGreaterThan(yearlySavings(1000, 500, battery, 2)[1]);
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
