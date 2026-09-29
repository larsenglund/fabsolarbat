import { getPowerTariff, monthlyPowerFees, PeakTracker } from "./powerTariff";
import { buildForecastIndex, estimateSolar } from "./solarForecast";
import type { Highs } from "./solver";
import { getSolver } from "./solver";
import type {
  AnnualResult,
  DayResult,
  EngineParams,
  HourRecord,
  PowerFeeMonth,
  PowerFeeSummary,
} from "./types";
import { runWindow } from "./window";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface SimulateOptions {
  params: EngineParams;
  initialSoc?: number;
  /** Keep each day's full hourly schedule on DayResult (for drill-down UIs). */
  retainHourly?: boolean;
  /** Called after each simulated day completes. */
  onProgress?: (dayNumber: number, totalDays: number) => void;
  /**
   * Reproduce the original Python driver's bookkeeping exactly, for the
   * golden-file validation of the LP port only: battery cycles (degradation)
   * counted over the whole 35 h window instead of the executed hours, SoC
   * handed over at window hour 23 even when a window executes 23 h (DST),
   * and the last window that fits the data dropped by an off-by-one.
   */
  pythonParity?: boolean;
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

/**
 * Reject parameter combinations that make the LP infeasible, with readable
 * messages — without this, a bad slider combination would surface as a bare
 * solver failure mid-year.
 */
export function validateEngineParams(params: EngineParams, initialSoc: number): void {
  const b = params.battery;
  if (b.maxChargePercent + b.depthOfDischargePercent < 100) {
    throw new Error(
      `Infeasible battery limits: max charge ${b.maxChargePercent}% is below the ` +
        `discharge floor ${100 - b.depthOfDischargePercent}% — the allowed SoC range is empty`,
    );
  }
  const floor = b.usableCapacityKwh * (1 - b.depthOfDischargePercent / 100);
  if (initialSoc < floor && b.acEfficiency * b.maxPowerKw < floor - initialSoc) {
    throw new Error(
      `Infeasible start: initial SoC ${initialSoc.toFixed(2)} kWh is below the ` +
        `${floor.toFixed(2)} kWh floor and max charge power cannot reach it within the first hour`,
    );
  }
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
  validateEngineParams(params, options.initialSoc ?? 0);

  const indexByTime = new Map<number, number>();
  for (let i = 0; i < hours.length; i++) {
    if (!indexByTime.has(hours[i].t)) indexByTime.set(hours[i].t, i);
  }
  const forecastIndex = buildForecastIndex(hours);

  const firstOpt = hours.find((r) => r.hour === planningHour);
  if (!firstOpt) throw new Error(`No row at planning hour ${planningHour} in dataset`);
  const dataEnd = hours[hours.length - 1].t;
  // A window starting at lastOptTime ends exactly on the last data row.
  const lastOptTime = dataEnd - (windowHours - (options.pythonParity ? 0 : 1)) * HOUR_MS;
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

  // Power tariff: the tracker feeds each window's LP with the month's
  // already-executed peaks; the executed grid draw (with and without the
  // battery) is kept for the exact monthly fee accounting at the end.
  const powerTariff = getPowerTariff(params.tariff.powerTariff);
  const peakTracker = powerTariff ? new PeakTracker(powerTariff) : null;
  const executedTimes: number[] = [];
  const executedBaselineGrid: number[] = [];
  const executedBatteryGrid: number[] = [];

  for (let k = 0; k < starts.length; k++) {
    const { time, startIdx, dayNumber } = starts[k];

    const rows = hours.slice(startIdx, startIdx + windowHours);
    const usesEstimates = solarForecast !== null;
    const planningSolar = usesEstimates
      ? estimateSolar(forecastIndex, startIdx, windowHours, solarForecast)
      : rows.map((r) => r.excessSolarKwh);

    let hourly: ReturnType<typeof runWindow>["hourly"];
    let summary: ReturnType<typeof runWindow>["summary"];
    try {
      ({ hourly, summary } = runWindow(highs, {
        rows,
        planningSolarKwh: planningSolar,
        initialSoc: currentSoc,
        cyclesCompleted: totalCycles,
        params,
        usesEstimates,
        peak: peakTracker?.windowInput(rows.map((r) => r.t)),
      }));
    } catch (err) {
      throw new Error(
        `Day ${dayNumber} (window starting ${new Date(time).toISOString().slice(0, 16)}): ` +
          `${(err as Error).message}`,
        { cause: err },
      );
    }

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
      const h = hourly[i];
      executedOriginalCost += h.baselineCost;
      executedOptimizedCost += h.cost;
      executedBatteryToHome += h.batteryToHome;
      if (peakTracker) {
        peakTracker.record(h.t, h.gridConsumption);
        executedTimes.push(h.t);
        executedBaselineGrid.push(h.consumptionKwh);
        executedBatteryGrid.push(h.gridConsumption);
      }
    }

    // Degradation follows the energy actually delivered: only the executed
    // hours (the plan's tail is re-planned, never run). The SoC handed to the
    // next window is the one at its start — after the last executed hour.
    const cap = params.battery.usableCapacityKwh;
    const dailyCycles = cap > 0 ? summary.totalBatteryToHome / cap : 0;
    if (options.pythonParity) {
      totalCycles += dailyCycles;
      currentSoc = hourly.length >= 24 ? hourly[23].soc : summary.finalSoc;
    } else {
      totalCycles += cap > 0 ? executedBatteryToHome / cap : 0;
      currentSoc = hourly[executedHours - 1].soc;
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
      ...(options.retainHourly ? { hourly } : {}),
    });
    options.onProgress?.(dayNumber, totalDays);
  }

  const totalOriginalCost = days.reduce((s, d) => s + d.originalCost, 0);
  const totalOptimizedCost = days.reduce((s, d) => s + d.optimizedCost, 0);
  const totalSavings = totalOriginalCost - totalOptimizedCost;
  const executedEnergyOriginal = days.reduce((s, d) => s + d.executedOriginalCost, 0);
  const executedEnergyOptimized = days.reduce((s, d) => s + d.executedOptimizedCost, 0);
  const executedDischarge = days.reduce((s, d) => s + d.executedBatteryToHome, 0);

  let powerFee: PowerFeeSummary | null = null;
  if (powerTariff) {
    const baseline = monthlyPowerFees(powerTariff, executedTimes, executedBaselineGrid);
    const battery = monthlyPowerFees(powerTariff, executedTimes, executedBatteryGrid);
    // Both series share the same hours, hence the same months in the same order.
    const months: PowerFeeMonth[] = baseline.map((b, i) => {
      const o = battery[i];
      return {
        monthKey: b.monthKey,
        month: (b.monthKey % 12) + 1,
        priceSekPerKw: b.priceSekPerKw,
        baselineKw: b.billedKw,
        optimizedKw: o.billedKw,
        baselineFee: b.feeSek,
        optimizedFee: o.feeSek,
        savings: b.feeSek - o.feeSek,
        baselinePeaks: b.peaks,
        optimizedPeaks: o.peaks,
      };
    });
    const baselineFee = months.reduce((s, m) => s + m.baselineFee, 0);
    const optimizedFee = months.reduce((s, m) => s + m.optimizedFee, 0);
    powerFee = {
      tariffId: powerTariff.id,
      months,
      baselineFee,
      optimizedFee,
      savings: baselineFee - optimizedFee,
    };
  }

  const executedOriginalCost = executedEnergyOriginal + (powerFee?.baselineFee ?? 0);
  const executedOptimizedCost = executedEnergyOptimized + (powerFee?.optimizedFee ?? 0);
  const executedSavings = executedOriginalCost - executedOptimizedCost;

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
    executedEnergySavings: executedEnergyOriginal - executedEnergyOptimized,
    powerFee,
    executedHours: days.reduce((s, d) => s + d.executedHours, 0),
    executedCycles:
      params.battery.usableCapacityKwh > 0
        ? executedDischarge / params.battery.usableCapacityKwh
        : 0,
  };
}
