import { describe, expect, it } from "vitest";
import { buildForecastIndex, estimateSolar } from "./solarForecast";
import type { HourRecord } from "./types";

/**
 * 5 synthetic days where solar at hours 8-16 equals the day number (1-5) and
 * is 0 otherwise — every method's estimate is hand-computable.
 * Planning at day 4, 13:00 (index 85); window offset k = index 85 + k.
 */
function makeHours(): HourRecord[] {
  const start = Date.UTC(2024, 4, 1);
  const hours: HourRecord[] = [];
  for (let d = 0; d < 5; d++) {
    for (let h = 0; h < 24; h++) {
      const t = start + (d * 24 + h) * 3_600_000;
      hours.push({
        t,
        hour: h,
        day: Math.floor(t / 86_400_000),
        excessSolarKwh: h >= 8 && h <= 16 ? d + 1 : 0,
        consumptionKwh: 1,
        priceSekPerKwh: 0.5,
      });
    }
  }
  return hours;
}

const OPT_IDX = 3 * 24 + 13; // day 4 (0-based d=3), 13:00

describe("estimateSolar", () => {
  const index = buildForecastIndex(makeHours());

  it("perfect returns actual future values", () => {
    const est = estimateSolar(index, OPT_IDX, 35, "perfect");
    expect(est[0]).toBe(4); // day 4, 13:00
    expect(est[21]).toBe(5); // day 5, 10:00
  });

  it("simple is the 3-day mean for the target hour", () => {
    const est = estimateSolar(index, OPT_IDX, 35, "simple");
    // Tomorrow 10:00: last three 10:00 rows before planning are days 2,3,4.
    expect(est[21]).toBeCloseTo((2 + 3 + 4) / 3, 12);
    // Tonight 22:00: always 0.
    expect(est[9]).toBe(0);
  });

  it("persistence repeats the last known value for the hour", () => {
    const est = estimateSolar(index, OPT_IDX, 35, "persistence");
    expect(est[21]).toBe(4); // last seen 10:00 was today (day 4)
    expect(est[1]).toBe(3); // last seen 14:00 was yesterday (day 3)
  });

  it("weighted favors recent days (4 samples renormalized)", () => {
    const est = estimateSolar(index, OPT_IDX, 35, "weighted");
    // Hour 10 has 4 prior samples (days 1-4) → weights [.15,.2,.25,.3]/0.9.
    const want = (1 * 0.15 + 2 * 0.2 + 3 * 0.25 + 4 * 0.3) / 0.9;
    expect(est[21]).toBeCloseTo(want, 12);
  });

  it("hybrid scales today's remaining hours by the observed-morning ratio", () => {
    const est = estimateSolar(index, OPT_IDX, 35, "hybrid");
    // Today's morning (hours 0-12): five hours of 4 → avg 20/13.
    // Historical morning: last 39 rows with hour 0-12 = mornings of days 2,3,4
    // → (10 + 15 + 20)/39. Scale = (20/13)/(45/39) = 4/3.
    // Today 14:00: base mean(1,2,3) = 2, scaled → 8/3.
    expect(est[1]).toBeCloseTo(8 / 3, 12);
    // Tomorrow 10:00: unscaled 3-day mean = 3.
    expect(est[21]).toBeCloseTo(3, 12);
  });
});
