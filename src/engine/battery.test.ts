import { describe, expect, it } from "vitest";
import { capacityFactor, socBounds } from "./battery";
import { fullPricePerKwh } from "./costModel";
import { DEFAULT_PARAMS } from "./types";

describe("capacityFactor", () => {
  it("is linear in cycles and clamps at EOL", () => {
    const b = DEFAULT_PARAMS.battery;
    expect(capacityFactor(0, b)).toBe(1);
    expect(capacityFactor(3000, b)).toBeCloseTo(0.85, 12);
    expect(capacityFactor(6000, b)).toBeCloseTo(0.7, 12);
    expect(capacityFactor(9999, b)).toBeCloseTo(0.7, 12);
  });
});

describe("socBounds", () => {
  it("applies DoD floor and max-charge ceiling to degraded capacity", () => {
    const b = { ...DEFAULT_PARAMS.battery, maxChargePercent: 95 };
    const s = socBounds(3000, b); // factor 0.85 → effective 11.747
    expect(s.effectiveCapacityKwh).toBeCloseTo(13.82 * 0.85, 9);
    expect(s.minSoc).toBeCloseTo(13.82 * 0.85 * 0.1, 9);
    expect(s.maxSoc).toBeCloseTo(13.82 * 0.85 * 0.95, 9);
  });
});

describe("fullPricePerKwh", () => {
  it("matches the reference cost model: spot × 1.25 + 0.685", () => {
    expect(fullPricePerKwh(1.0, DEFAULT_PARAMS.tariff)).toBeCloseTo(1.935, 12);
    expect(fullPricePerKwh(0, DEFAULT_PARAMS.tariff)).toBeCloseTo(0.685, 12);
    // Negative spot prices reduce but rarely eliminate the total cost.
    expect(fullPricePerKwh(-0.8, DEFAULT_PARAMS.tariff)).toBeCloseTo(-0.315, 12);
  });

  it("adds retailer markup like the transfer fee", () => {
    expect(
      fullPricePerKwh(1.0, {
        vatMultiplier: 1.25,
        transferFeeSekPerKwh: 0.5,
        fixedMarkupSekPerKwh: 0.1,
      }),
    ).toBeCloseTo(1.85, 12);
  });
});
