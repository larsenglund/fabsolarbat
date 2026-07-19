import { describe, expect, it } from "vitest";
import { socBounds } from "../src/engine/battery";
import { simulateYear } from "../src/engine/simulate";
import { getSolver } from "../src/engine/solver";
import { DEFAULT_PARAMS, type EngineParams, type HourRecord } from "../src/engine/types";
import { runWindow } from "../src/engine/window";

/** Deterministic PRNG (mulberry32) so failures reproduce exactly. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticHours(days: number, seed: number): HourRecord[] {
  const rand = rng(seed);
  const start = Date.UTC(2024, 2, 1);
  const hours: HourRecord[] = [];
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const t = start + (d * 24 + h) * 3_600_000;
      // Day/night price shape with noise; occasionally negative like real spot data.
      const price = 0.5 + 0.45 * Math.sin(((h - 3) / 24) * 2 * Math.PI) + (rand() - 0.55);
      const solar =
        h >= 8 && h <= 17 ? Math.max(0, 3 * Math.sin(((h - 8) / 9) * Math.PI) * rand()) : 0;
      const consumption = Math.max(0, 1.5 + 2.5 * rand() - solar * 0.3);
      hours.push({
        t,
        hour: h,
        day: Math.floor(t / 86_400_000),
        priceSekPerKwh: price,
        excessSolarKwh: solar,
        consumptionKwh: consumption,
      });
    }
  }
  return hours;
}

// HiGHS returns primal values at its feasibility tolerance (~1e-6); allow a
// margin above it. 0.0001 kWh is far below anything physically meaningful.
const EPS = 1e-4;

describe("engine invariants on seeded synthetic data", () => {
  it("window plan respects physics and never beats-the-baseline backwards", async () => {
    const highs = await getSolver();
    const params = DEFAULT_PARAMS;
    const bounds = socBounds(0, params.battery);

    for (const seed of [1, 42, 2024]) {
      const hours = syntheticHours(3, seed);
      const rows = hours.slice(13, 13 + 35);
      // Start at the SoC floor so doing nothing is feasible → optimal ≤ baseline.
      const { hourly, summary } = runWindow(highs, {
        rows,
        planningSolarKwh: rows.map((r) => r.excessSolarKwh),
        initialSoc: bounds.minSoc,
        cyclesCompleted: 0,
        params,
        usesEstimates: false,
      });

      expect(summary.optimizedCost).toBeLessThanOrEqual(summary.originalCost + EPS);

      let prevSoc = bounds.minSoc;
      for (const h of hourly) {
        expect(h.soc).toBeGreaterThanOrEqual(bounds.minSoc - EPS);
        expect(h.soc).toBeLessThanOrEqual(bounds.maxSoc + EPS);
        expect(h.solarToBattery).toBeGreaterThanOrEqual(-EPS);
        expect(h.solarToBattery).toBeLessThanOrEqual(h.excessSolarKwh + EPS);
        expect(h.solarToBattery + h.gridToBattery).toBeLessThanOrEqual(
          params.battery.maxPowerKw + EPS,
        );
        expect(h.batteryToHome).toBeLessThanOrEqual(
          Math.min(params.battery.maxPowerKw, h.consumptionKwh) + EPS,
        );
        expect(h.gridConsumption).toBeGreaterThanOrEqual(-EPS);
        // Energy conservation: SoC delta equals charged minus discharged energy
        // (to LP solver feasibility tolerance, ~1e-6).
        const eff = params.battery.acEfficiency;
        const expected =
          prevSoc + eff * (h.solarToBattery + h.gridToBattery) - h.batteryToHome / eff;
        expect(h.soc).toBeCloseTo(expected, 4);
        prevSoc = h.soc;
      }
    }
  });

  it("estimation-based execution keeps SoC within bounds and costs consistent", async () => {
    const hours = syntheticHours(14, 7);
    const result = await simulateYear(hours, { params: DEFAULT_PARAMS });
    expect(result.days.length).toBeGreaterThan(10);
    for (const d of result.days) {
      // Bounds shrink with degradation — use the day's effective capacity.
      const dod = DEFAULT_PARAMS.battery.depthOfDischargePercent / 100;
      expect(d.finalSoc).toBeGreaterThanOrEqual(d.effectiveCapacityKwh * (1 - dod) - 1e-3);
      expect(d.finalSoc).toBeLessThanOrEqual(d.effectiveCapacityKwh + 1e-3);
      expect(d.originalCost - d.optimizedCost).toBeCloseTo(d.savings, 9);
    }
    // A battery worth its name should save money over two synthetic weeks.
    expect(result.totalSavings).toBeGreaterThan(0);

    // Executed accounting: internally consistent per day, and annual executed
    // hours partition the covered range exactly (24 h/day + final full window).
    for (const d of result.days) {
      expect(d.executedSavings).toBeCloseTo(d.executedOriginalCost - d.executedOptimizedCost, 9);
      expect(d.executedBatteryToHome).toBeLessThanOrEqual(d.batteryToHome + 1e-9);
    }
    const executedHourSum = result.days.reduce((s, d) => s + d.executedHours, 0);
    const expectedHours = (result.days.length - 1) * 24 + DEFAULT_PARAMS.strategy.windowHours;
    expect(executedHourSum).toBe(expectedHours);
  });

  it("rejects infeasible parameter combinations with readable errors", async () => {
    const hours = syntheticHours(3, 5);
    const b = DEFAULT_PARAMS.battery;
    // Empty SoC range: ceiling below floor.
    await expect(
      simulateYear(hours, {
        params: {
          ...DEFAULT_PARAMS,
          battery: { ...b, maxChargePercent: 5, depthOfDischargePercent: 50 },
        },
      }),
    ).rejects.toThrow(/SoC range is empty/);
    // Day-1 floor unreachable: DoD 10% → floor 12.4 kWh, max first-hour charge 1.9 kWh.
    await expect(
      simulateYear(hours, {
        params: {
          ...DEFAULT_PARAMS,
          battery: { ...b, depthOfDischargePercent: 10, maxPowerKw: 2 },
        },
      }),
    ).rejects.toThrow(/cannot reach it within the first hour/);
  });

  it("a battery with zero capacity and zero power changes nothing", async () => {
    // Zero capacity alone is NOT enough: the model (like the Python original)
    // permits same-hour solar pass-through via the battery. Zero power is the
    // true "no battery" configuration.
    const hours = syntheticHours(5, 99);
    const params: EngineParams = {
      ...DEFAULT_PARAMS,
      battery: { ...DEFAULT_PARAMS.battery, usableCapacityKwh: 0, maxPowerKw: 0 },
    };
    const result = await simulateYear(hours, { params });
    for (const d of result.days) {
      expect(d.savings).toBeCloseTo(0, 9);
      expect(d.solarToBattery).toBeCloseTo(0, 9);
      expect(d.gridToBattery).toBeCloseTo(0, 9);
      expect(d.batteryToHome).toBeCloseTo(0, 9);
    }
  });
});
