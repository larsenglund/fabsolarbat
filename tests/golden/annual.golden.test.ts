import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMergedCsv, parseNaiveTimestamp } from "../../src/data/parsers/mergedCsv";
import { simulateYear } from "../../src/engine/simulate";
import { DEFAULT_PARAMS } from "../../src/engine/types";

/**
 * The M1 gate (docs/PLAN.md): the TypeScript engine must reproduce the
 * validated Python LP analysis on the full 2024 dataset.
 *
 * Golden data was produced by annual_battery_analysis.py --estimate-solar
 * (hybrid method) with the constants in battery_analysis_linear.py, which are
 * exactly DEFAULT_PARAMS. Tolerances allow for CBC vs HiGHS alternate optima:
 * per-day cost within 0.5%, annual total within 0.1%.
 */

interface GoldenDay {
  day: number;
  t: number;
  originalCost: number;
  optimizedCost: number;
  savings: number;
  solarToBattery: number;
  gridToBattery: number;
  batteryToHome: number;
  initialSoc: number;
  finalSoc: number;
  minPrice: number;
  maxPrice: number;
  totalCycles: number;
}

function loadGolden(): GoldenDay[] {
  const text = readFileSync(join(process.cwd(), "data", "annual_battery_results.csv"), "utf8");
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Missing golden column ${name}`);
    return i;
  };
  const c = {
    day: col("day"),
    datetime: col("datetime"),
    originalCost: col("original_cost"),
    optimizedCost: col("optimized_cost"),
    savings: col("savings"),
    solarToBattery: col("solar_to_battery"),
    gridToBattery: col("grid_to_battery"),
    batteryToHome: col("battery_to_home"),
    initialSoc: col("initial_soc"),
    finalSoc: col("final_soc"),
    minPrice: col("min_price"),
    maxPrice: col("max_price"),
    totalCycles: col("total_cycles"),
  };
  return lines.slice(1).map((line) => {
    const p = line.split(",");
    const t = parseNaiveTimestamp(p[c.datetime]);
    if (t === null) throw new Error(`Bad golden datetime: ${p[c.datetime]}`);
    return {
      day: Number(p[c.day]),
      t,
      originalCost: Number(p[c.originalCost]),
      optimizedCost: Number(p[c.optimizedCost]),
      savings: Number(p[c.savings]),
      solarToBattery: Number(p[c.solarToBattery]),
      gridToBattery: Number(p[c.gridToBattery]),
      batteryToHome: Number(p[c.batteryToHome]),
      initialSoc: Number(p[c.initialSoc]),
      finalSoc: Number(p[c.finalSoc]),
      minPrice: Number(p[c.minPrice]),
      maxPrice: Number(p[c.maxPrice]),
      totalCycles: Number(p[c.totalCycles]),
    };
  });
}

function worst(
  label: string,
  diffs: { day: number; got: number; want: number; err: number }[],
  n = 5,
): string {
  const top = [...diffs].sort((a, b) => b.err - a.err).slice(0, n);
  return `${label} worst days: ${top
    .map(
      (d) =>
        `day ${d.day}: got ${d.got.toFixed(4)}, want ${d.want.toFixed(4)} (err ${d.err.toExponential(2)})`,
    )
    .join("; ")}`;
}

describe("golden-file validation against the Python LP analysis", () => {
  it("reproduces annual_battery_results.csv on the 2024 dataset", {
    timeout: 600_000,
  }, async () => {
    const hours = parseMergedCsv(
      readFileSync(join(process.cwd(), "data", "merged_hourly_data.csv"), "utf8"),
    );
    const golden = loadGolden();

    const result = await simulateYear(hours, { params: DEFAULT_PARAMS });

    // Same days simulated, same window starts.
    expect(result.days.length).toBe(golden.length);
    for (let i = 0; i < golden.length; i++) {
      expect(result.days[i].t, `day ${golden[i].day} window start`).toBe(golden[i].t);
    }

    // Baseline (no-battery) cost is pure arithmetic — must match to float noise.
    const originalDiffs = golden.map((g, i) => ({
      day: g.day,
      got: result.days[i].originalCost,
      want: g.originalCost,
      err: Math.abs(result.days[i].originalCost - g.originalCost) / Math.max(1, g.originalCost),
    }));
    expect(
      Math.max(...originalDiffs.map((d) => d.err)),
      worst("original_cost", originalDiffs),
    ).toBeLessThan(1e-9);

    // Window price stats are arithmetic too.
    for (let i = 0; i < golden.length; i++) {
      expect(result.days[i].minPrice).toBeCloseTo(golden[i].minPrice, 9);
      expect(result.days[i].maxPrice).toBeCloseTo(golden[i].maxPrice, 9);
    }

    // Optimized cost: LP result — per-day within 0.5% (or 0.05 SEK for tiny days).
    const optDiffs = golden.map((g, i) => ({
      day: g.day,
      got: result.days[i].optimizedCost,
      want: g.optimizedCost,
      err:
        Math.abs(result.days[i].optimizedCost - g.optimizedCost) /
        Math.max(10, Math.abs(g.optimizedCost)),
    }));
    expect(Math.max(...optDiffs.map((d) => d.err)), worst("optimized_cost", optDiffs)).toBeLessThan(
      0.005,
    );

    // Carried state: SoC handoff and cycle accumulation must track closely.
    const socDiffs = golden.map((g, i) => ({
      day: g.day,
      got: result.days[i].initialSoc,
      want: g.initialSoc,
      err: Math.abs(result.days[i].initialSoc - g.initialSoc),
    }));
    expect(Math.max(...socDiffs.map((d) => d.err)), worst("initial_soc", socDiffs)).toBeLessThan(
      0.5,
    );

    const finalCyclesGot = result.totalCycles;
    const finalCyclesWant = golden[golden.length - 1].totalCycles;
    expect(Math.abs(finalCyclesGot - finalCyclesWant) / finalCyclesWant).toBeLessThan(0.01);

    // Annual totals: the headline numbers, within 0.1%.
    const annualOriginalWant = golden.reduce((s, g) => s + g.originalCost, 0);
    const annualOptimizedWant = golden.reduce((s, g) => s + g.optimizedCost, 0);
    const annualSavingsWant = annualOriginalWant - annualOptimizedWant;
    expect(
      Math.abs(result.totalOriginalCost - annualOriginalWant) / annualOriginalWant,
    ).toBeLessThan(1e-9);
    expect(Math.abs(result.totalSavings - annualSavingsWant) / annualSavingsWant).toBeLessThan(
      0.001,
    );
  });
});
