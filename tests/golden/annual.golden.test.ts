import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMergedCsv, parseNaiveTimestamp } from "../../src/data/parsers/mergedCsv";
import { annualize } from "../../src/engine/finance";
import { POWER_TARIFFS } from "../../src/engine/powerTariff";
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

    // Parity mode reproduces the Python driver's bookkeeping (see
    // SimulateOptions.pythonParity); the corrected default is pinned below.
    const result = await simulateYear(hours, { params: DEFAULT_PARAMS, pythonParity: true });

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
      0.02,
    );

    const finalCyclesGot = result.totalCycles;
    const finalCyclesWant = golden[golden.length - 1].totalCycles;
    expect(Math.abs(finalCyclesGot - finalCyclesWant) / finalCyclesWant).toBeLessThan(0.01);

    // Window-summed annual totals: Python-parity numbers within 0.1%.
    // (These are inflated ~1.5× by the 11 h window overlap — parity only,
    // never headline figures. The executed* fields below are the honest ones.)
    const annualOriginalWant = golden.reduce((s, g) => s + g.originalCost, 0);
    const annualOptimizedWant = golden.reduce((s, g) => s + g.optimizedCost, 0);
    const annualSavingsWant = annualOriginalWant - annualOptimizedWant;
    expect(
      Math.abs(result.totalOriginalCost - annualOriginalWant) / annualOriginalWant,
    ).toBeLessThan(1e-9);
    expect(Math.abs(result.totalSavings - annualSavingsWant) / annualSavingsWant).toBeLessThan(
      0.001,
    );

    // Executed-hours accounting cross-check, computed INDEPENDENTLY of the
    // engine: the executed spans must partition the simulated row range —
    // first window start through the last window's end — counting every row
    // exactly once, and the executed baseline must equal Σ consumption ×
    // fullPrice over exactly those rows. (The last ~24 h of the dataset fall
    // after the final window and are simulated by no window — the Python
    // driver stops 35 h before the data end.)
    const firstIdx = hours.findIndex((h) => h.t === golden[0].t);
    const lastStartIdx = hours.findIndex((h) => h.t === result.days[result.days.length - 1].t);
    const covered = hours.slice(firstIdx, lastStartIdx + 35);
    const independentBaseline = covered.reduce(
      (s, h) => s + h.consumptionKwh * (h.priceSekPerKwh * 1.25 + 0.685),
      0,
    );
    const executedHourSum = result.days.reduce((s, d) => s + d.executedHours, 0);
    expect(executedHourSum).toBe(covered.length);
    expect(
      Math.abs(result.executedOriginalCost - independentBaseline) / independentBaseline,
    ).toBeLessThan(1e-9);

    // The honest savings must be meaningfully below the window-summed figure
    // (overlap inflation) but still clearly positive.
    expect(result.executedSavings).toBeGreaterThan(0);
    expect(result.executedSavings).toBeLessThan(result.totalSavings);
    expect(result.executedCycles).toBeLessThan(result.totalCycles);

    // The Python run's figures with executed-hours accounting (±1% for
    // solver drift) — docs/PRIOR_WORK.md § Corrections.
    expect(Math.abs(result.executedSavings - 3967) / 3967).toBeLessThan(0.01);
    expect(Math.abs(result.executedCycles - 336.5) / 336.5).toBeLessThan(0.01);
  });

  it("corrected bookkeeping moves the headline only slightly", {
    timeout: 600_000,
  }, async () => {
    const hours = parseMergedCsv(
      readFileSync(join(process.cwd(), "data", "merged_hourly_data.csv"), "utf8"),
    );
    const result = await simulateYear(hours, { params: DEFAULT_PARAMS });

    // The last window that fits the data (Dec 30 13:00 → Dec 31 23:00) is
    // simulated too: 365 windows, every row from the first window start to
    // the end of the data executed exactly once.
    expect(result.days.length).toBe(365);
    const firstIdx = hours.findIndex((h) => h.t === result.days[0].t);
    expect(result.executedHours).toBe(hours.length - firstIdx);

    // Degradation follows executed discharge only.
    expect(result.totalCycles).toBeCloseTo(result.executedCycles, 0);

    // Pin the headline aggregates (±1% for solver drift). These constants are
    // what the app and docs advertise — a shift here means the public numbers
    // need updating too (Landing.tsx REFERENCE, InfoPage.tsx table, e2e specs,
    // README, docs/PRIOR_WORK.md Corrections).
    const annual = annualize(result);
    expect(Math.abs(annual.annualSavings - 3977) / 3977).toBeLessThan(0.01);
    expect(Math.abs(annual.annualCycles - 337.8) / 337.8).toBeLessThan(0.01);
    expect(Math.abs(annual.annualOriginalCost - 25210) / 25210).toBeLessThan(1e-3);
    expect(Math.abs(result.executedSavingsPct - 15.77) / 15.77).toBeLessThan(0.01);
  });
});

describe("sell-at-spot market model on the 2024 dataset", () => {
  it("prices the opportunity cost of diverted solar", { timeout: 600_000 }, async () => {
    const hours = parseMergedCsv(
      readFileSync(join(process.cwd(), "data", "merged_hourly_data.csv"), "utf8"),
    );
    const result = await simulateYear(hours, {
      params: {
        ...DEFAULT_PARAMS,
        strategy: { ...DEFAULT_PARAMS.strategy, model: "sell-at-spot" },
      },
    });
    // Pinned headline (5 ore/kWh default export bonus, skattereduktion
    // abolished): must track the app copy if it ever shifts.
    const annual = annualize(result);
    expect(Math.abs(annual.annualSavings - 3024) / 3024).toBeLessThan(0.01);
    // Selling makes the BASELINE cheaper and the battery less valuable than
    // in the no-sell model (3 977 SEK/yr, baseline 25 210 SEK/yr).
    expect(annual.annualSavings).toBeLessThan(3977);
    expect(annual.annualOriginalCost).toBeLessThan(25210);
  });
});

describe("effektavgift (Falu Energi & Vatten) on the 2024 dataset", () => {
  it("bills peaks exactly and shaves them", { timeout: 600_000 }, async () => {
    const hours = parseMergedCsv(
      readFileSync(join(process.cwd(), "data", "merged_hourly_data.csv"), "utf8"),
    );
    const fev = POWER_TARIFFS["fev-2025"];
    const result = await simulateYear(hours, {
      params: { ...DEFAULT_PARAMS, tariff: { ...DEFAULT_PARAMS.tariff, powerTariff: "fev-2025" } },
      retainHourly: true,
    });
    const fee = result.powerFee;
    if (!fee) throw new Error("expected a power-fee summary");

    // Independent re-derivation of both bills from the executed hours: per
    // month, each measured day's highest draw; the mean of the top three
    // days × 75 kr (Nov–Mar).
    const bill = (series: { t: number; kwh: number }[]) => {
      const dayMax = new Map<string, number>();
      for (const { t, kwh } of series) {
        if (fev.hourWeight(t) === 0) continue;
        const day = new Date(t).toISOString().slice(0, 10);
        dayMax.set(day, Math.max(dayMax.get(day) ?? 0, kwh));
      }
      const byMonth = new Map<string, number[]>();
      for (const [day, kw] of dayMax) {
        const month = day.slice(0, 7);
        byMonth.set(month, [...(byMonth.get(month) ?? []), kw]);
      }
      let total = 0;
      for (const [month, peaks] of byMonth) {
        const top = peaks.sort((a, b) => b - a).slice(0, 3);
        const price = fev.priceSekPerKwByMonth[Number(month.slice(5, 7)) - 1];
        total += (top.reduce((s, x) => s + x, 0) / 3) * price;
      }
      return total;
    };
    const executed = result.days.flatMap((d) => d.hourly?.slice(0, d.executedHours) ?? []);
    expect(executed.length).toBe(result.executedHours);
    expect(fee.baselineFee).toBeCloseTo(
      bill(executed.map((h) => ({ t: h.t, kwh: h.consumptionKwh }))),
      6,
    );
    expect(fee.optimizedFee).toBeCloseTo(
      bill(executed.map((h) => ({ t: h.t, kwh: h.gridConsumption }))),
      6,
    );

    // The battery never raises a month's billed power, and the fee saving is
    // part of the headline savings.
    for (const m of fee.months) expect(m.optimizedKw).toBeLessThanOrEqual(m.baselineKw + 1e-6);
    expect(result.executedSavings).toBeCloseTo(result.executedEnergySavings + fee.savings, 6);

    // Pinned headline for the sample household on FEV's tariff (hybrid
    // forecast, 2024 per-kWh fee): ~1 480 kr/yr of lower effektavgift.
    const annual = annualize(result);
    expect(annual.annualPowerFeeSavings).toBeCloseTo(fee.savings, 9); // 12 months: bills as-is
    expect(Math.abs(annual.annualPowerFeeSavings - 1478) / 1478).toBeLessThan(0.02);
    expect(Math.abs(annual.annualSavings - 5273) / 5273).toBeLessThan(0.01);
  });
});
