import { buildForecastIndex, estimateSolar } from "./solarForecast";
import type { Highs } from "./solver";
import { getSolver } from "./solver";
import type { AnnualResult, DayResult, EngineParams, HourRecord } from "./types";
import { runWindow } from "./window";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface SimulateOptions {
  params: EngineParams;
  initialSoc?: number;
  onProgress?: (dayNumber: number, totalDays: number) => void;
}

/**
 * Rolling day-ahead simulation over the full dataset, mirroring
 * run_annual_analysis() in the Python model:
 *
 * - The first window starts at the first row whose hour equals the planning
 *   hour; subsequent windows start exactly 24 h later.
 * - Each window covers `windowHours` consecutive ROWS from the start row
 *   (index-based, like df.iloc — a missing DST hour shifts the window end).
 * - The SoC after window hour index 23 (12:00 next day) carries into the next
 *   window; discharged energy accumulates cycles which degrade capacity.
 * - Days whose start timestamp is missing from the data are skipped.
 */
export async function simulateYear(
  hours: HourRecord[],
  options: SimulateOptions,
): Promise<AnnualResult> {
  const highs = await getSolver();
  return simulateYearSync(highs, hours, options);
}

export function simulateYearSync(
  highs: Highs,
  hours: HourRecord[],
  options: SimulateOptions,
): AnnualResult {
  const { params } = options;
  const { windowHours, planningHour, solarForecast } = params.strategy;
  if (hours.length < windowHours) {
    throw new Error(`Dataset has ${hours.length} hours; need at least ${windowHours}`);
  }

  const indexByTime = new Map<number, number>();
  for (let i = 0; i < hours.length; i++) {
    if (!indexByTime.has(hours[i].t)) indexByTime.set(hours[i].t, i);
  }
  const forecastIndex = buildForecastIndex(hours);

  const firstOpt = hours.find((r) => r.hour === planningHour);
  if (!firstOpt) throw new Error(`No row at planning hour ${planningHour} in dataset`);
  const dataEnd = hours[hours.length - 1].t;
  const lastOptTime = dataEnd - windowHours * HOUR_MS;
  const totalDays = Math.floor((lastOptTime - firstOpt.t) / DAY_MS) + 1;

  const days: DayResult[] = [];
  let currentSoc = options.initialSoc ?? 0;
  let totalCycles = 0;
  let dayNumber = 0;

  for (let time = firstOpt.t; time <= lastOptTime; time += DAY_MS) {
    dayNumber++;
    options.onProgress?.(dayNumber, totalDays);

    const startIdx = indexByTime.get(time);
    if (startIdx === undefined) continue; // missing timestamp (DST) — skip day, like Python
    if (startIdx + windowHours > hours.length) break;

    const rows = hours.slice(startIdx, startIdx + windowHours);
    const usesEstimates = solarForecast !== null;
    const planningSolar = usesEstimates
      ? estimateSolar(forecastIndex, startIdx, windowHours, solarForecast)
      : rows.map((r) => r.excessSolarKwh);

    const { hourly, summary } = runWindow(highs, {
      rows,
      planningSolarKwh: planningSolar,
      initialSoc: currentSoc,
      cyclesCompleted: totalCycles,
      params,
      usesEstimates,
    });

    const dailyCycles =
      params.battery.usableCapacityKwh > 0
        ? summary.totalBatteryToHome / params.battery.usableCapacityKwh
        : 0;
    totalCycles += dailyCycles;
    currentSoc = hourly.length >= 24 ? hourly[23].soc : summary.finalSoc;

    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = Number.NEGATIVE_INFINITY;
    for (const h of hourly) {
      if (h.fullPrice < minPrice) minPrice = h.fullPrice;
      if (h.fullPrice > maxPrice) maxPrice = h.fullPrice;
    }

    days.push({
      dayNumber,
      t: time,
      month: new Date(time).getUTCMonth() + 1,
      originalCost: summary.originalCost,
      optimizedCost: summary.optimizedCost,
      savings: summary.savings,
      savingsPct: summary.originalCost > 0 ? (summary.savings / summary.originalCost) * 100 : 0,
      solarToBattery: summary.totalSolarToBattery,
      gridToBattery: summary.totalGridToBattery,
      batteryToHome: summary.totalBatteryToHome,
      initialSoc: summary.initialSoc,
      finalSoc: summary.finalSoc,
      minPrice,
      maxPrice,
      priceSpread: maxPrice - minPrice,
      dailyCycles,
      totalCycles,
      capacityFactor: summary.capacityFactor,
      effectiveCapacityKwh: summary.effectiveCapacityKwh,
      solarActualTotal: summary.solarActualTotal,
      solarEstimatedTotal: summary.solarEstimatedTotal,
      solarEstimationError: summary.solarEstimatedTotal - summary.solarActualTotal,
      solarEstimationRmse: summary.solarEstimationRmse,
    });
  }

  const totalOriginalCost = days.reduce((s, d) => s + d.originalCost, 0);
  const totalOptimizedCost = days.reduce((s, d) => s + d.optimizedCost, 0);
  const totalSavings = totalOriginalCost - totalOptimizedCost;

  return {
    days,
    totalOriginalCost,
    totalOptimizedCost,
    totalSavings,
    savingsPct: totalOriginalCost > 0 ? (totalSavings / totalOriginalCost) * 100 : 0,
    totalCycles,
  };
}
