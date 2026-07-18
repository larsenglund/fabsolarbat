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

  // Determine all simulated window starts up front so executed-hours
  // accounting can see where the NEXT window begins (a missing DST hour or a
  // skipped day shifts it away from exactly 24 rows).
  const starts: { time: number; startIdx: number; dayNumber: number }[] = [];
  {
    let dayNumber = 0;
    for (let time = firstOpt.t; time <= lastOptTime; time += DAY_MS) {
      dayNumber++;
      const startIdx = indexByTime.get(time);
      if (startIdx === undefined) continue; // missing timestamp — skip day, like Python
      if (startIdx + windowHours > hours.length) break;
      starts.push({ time, startIdx, dayNumber });
    }
  }

  const days: DayResult[] = [];
  let currentSoc = options.initialSoc ?? 0;
  let totalCycles = 0;

  for (let k = 0; k < starts.length; k++) {
    const { time, startIdx, dayNumber } = starts[k];
    options.onProgress?.(dayNumber, totalDays);

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

    // Executed-hours accounting: this window only governs reality until the
    // next simulated window starts (normally 24 rows later; 23 across the
    // missing DST hour; more after a skipped day, capped at the window). The
    // final window keeps its full length. Summed across days, every row in
    // the simulated range lands in exactly one window.
    const executedHours =
      k < starts.length - 1
        ? Math.min(hourly.length, starts[k + 1].startIdx - startIdx)
        : hourly.length;
    let executedOriginalCost = 0;
    let executedOptimizedCost = 0;
    let executedBatteryToHome = 0;
    for (let i = 0; i < executedHours; i++) {
      executedOriginalCost += hourly[i].consumptionKwh * hourly[i].fullPrice;
      executedOptimizedCost += hourly[i].cost;
      executedBatteryToHome += hourly[i].batteryToHome;
    }

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
      executedHours,
      executedOriginalCost,
      executedOptimizedCost,
      executedSavings: executedOriginalCost - executedOptimizedCost,
      executedBatteryToHome,
    });
  }

  const totalOriginalCost = days.reduce((s, d) => s + d.originalCost, 0);
  const totalOptimizedCost = days.reduce((s, d) => s + d.optimizedCost, 0);
  const totalSavings = totalOriginalCost - totalOptimizedCost;
  const executedOriginalCost = days.reduce((s, d) => s + d.executedOriginalCost, 0);
  const executedOptimizedCost = days.reduce((s, d) => s + d.executedOptimizedCost, 0);
  const executedSavings = executedOriginalCost - executedOptimizedCost;
  const executedDischarge = days.reduce((s, d) => s + d.executedBatteryToHome, 0);

  return {
    days,
    totalOriginalCost,
    totalOptimizedCost,
    totalSavings,
    savingsPct: totalOriginalCost > 0 ? (totalSavings / totalOriginalCost) * 100 : 0,
    totalCycles,
    executedOriginalCost,
    executedOptimizedCost,
    executedSavings,
    executedSavingsPct:
      executedOriginalCost > 0 ? (executedSavings / executedOriginalCost) * 100 : 0,
    executedCycles:
      params.battery.usableCapacityKwh > 0
        ? executedDischarge / params.battery.usableCapacityKwh
        : 0,
  };
}
