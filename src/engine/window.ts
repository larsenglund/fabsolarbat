import { socBounds } from "./battery";
import { fullPricePerKwh } from "./costModel";
import { solveWindow } from "./lp";
import type { Highs } from "./solver";
import type { EngineParams, HourRecord, HourResult, WindowSummary } from "./types";

export interface WindowRunInput {
  /** The window's rows with ACTUAL data (consumption, solar, price). */
  rows: HourRecord[];
  /** Solar series the LP plans against (estimates, or actuals for perfect). */
  planningSolarKwh: number[];
  initialSoc: number;
  cyclesCompleted: number;
  params: EngineParams;
  /** True when planningSolar is an estimate — enables the execution-adjustment pass. */
  usesEstimates: boolean;
}

export interface WindowRunResult {
  hourly: HourResult[];
  summary: WindowSummary;
}

/**
 * Solve one planning window and account the executed schedule, mirroring
 * optimize_battery_linear_programming() in the Python model.
 *
 * With estimates the LP plan is replayed against actual solar: extra solar is
 * absorbed up to the free charge capacity, shortfalls reduce solar charging,
 * and SoC violations clamp discharge (at the floor) or grid charging (at the
 * ceiling, keeping free solar first).
 */
export function runWindow(highs: Highs, input: WindowRunInput): WindowRunResult {
  const { rows, params, initialSoc, usesEstimates } = input;
  const { battery, strategy } = params;
  const eff = battery.acEfficiency;
  const bounds = socBounds(input.cyclesCompleted, battery);
  const fullPrice = rows.map((r) => fullPricePerKwh(r.priceSekPerKwh, params.tariff));

  // Degradation shrinks the ceiling a little every day; SoC carried from
  // yesterday can sit above today's maxSoc with no consumption to discharge
  // into (Python's CBC absorbs this within its feasibility tolerance). Admit
  // the pre-existing charge in the LP; the accounting pass below still clamps
  // the executed SoC to the true bounds.
  const plan = solveWindow(highs, {
    fullPrice,
    consumptionKwh: rows.map((r) => r.consumptionKwh),
    planningSolarKwh: input.planningSolarKwh,
    initialSoc,
    minSoc: bounds.minSoc,
    maxSoc: Math.max(bounds.maxSoc, initialSoc),
    maxPowerKw: battery.maxPowerKw,
    efficiency: eff,
    gridChargePenalty: strategy.gridChargePenaltySekPerKwh,
  });

  const hourly: HourResult[] = [];
  let actualSoc = initialSoc;
  let sumS2b = 0;
  let sumG2b = 0;
  let sumB2h = 0;
  let originalCost = 0;
  let optimizedCost = 0;
  let solarActualTotal = 0;
  let solarEstimatedTotal = 0;
  let sqErrSum = 0;

  for (let t = 0; t < rows.length; t++) {
    const row = rows[t];
    const actualSolar = row.excessSolarKwh;
    let s2b = plan.solarToBattery[t];
    let g2b = plan.gridToBattery[t];
    let b2h = plan.batteryToHome[t];
    let soc: number;

    if (usesEstimates) {
      // Solar charging: bounded by what actually exists; bonus-charge extra
      // solar into any unused charge capacity.
      const s2bPlanned = s2b;
      const g2bPlanned = g2b;
      s2b = Math.min(s2bPlanned, actualSolar);
      if (actualSolar > s2bPlanned) {
        const capacityUsed = s2bPlanned + g2bPlanned;
        const extra = Math.min(battery.maxPowerKw - capacityUsed, actualSolar - s2bPlanned);
        s2b = s2bPlanned + Math.max(0, extra);
      }

      let charge = eff * (s2b + g2b);
      let discharge = b2h / eff;
      let newSoc = actualSoc + charge - discharge;

      if (newSoc < bounds.minSoc) {
        // Can't discharge as much as planned — clamp at the SoC floor.
        const maxDischarge = (actualSoc + charge - bounds.minSoc) * eff;
        b2h = Math.max(0, Math.min(b2h, maxDischarge));
        discharge = b2h / eff;
        newSoc = actualSoc + charge - discharge;
      } else if (newSoc > bounds.maxSoc) {
        // Would overcharge — keep free solar, reduce grid charging first.
        // maxCharge can be slightly negative when carried SoC sits above the
        // freshly-degraded ceiling; clamp at zero so flows never go negative
        // (the Python original recorded a tiny negative solar flow here).
        const maxCharge = Math.max(0, (bounds.maxSoc - actualSoc + discharge) / eff);
        if (s2b + g2b > maxCharge) {
          if (s2b <= maxCharge) {
            g2b = Math.max(0, maxCharge - s2b);
          } else {
            s2b = maxCharge;
            g2b = 0;
          }
        }
        charge = eff * (s2b + g2b);
        newSoc = actualSoc + charge - discharge;
      }

      actualSoc = Math.max(bounds.minSoc, Math.min(bounds.maxSoc, newSoc));
      soc = actualSoc;

      solarActualTotal += actualSolar;
      solarEstimatedTotal += input.planningSolarKwh[t];
      sqErrSum += (input.planningSolarKwh[t] - actualSolar) ** 2;
    } else {
      // Perfect-information path: record the LP plan directly, but clamp to
      // the true degraded ceiling — the LP's relaxed ceiling (see above) may
      // hold pre-existing charge above it, and without the estimates pass
      // there is no other clamp, so the excess would otherwise carry forward.
      soc = Math.min(plan.soc[t], bounds.maxSoc);
      actualSoc = soc;
      solarActualTotal += actualSolar;
      solarEstimatedTotal += actualSolar;
    }

    const gridConsumption = row.consumptionKwh - b2h + g2b;
    const cost = fullPrice[t] * gridConsumption;

    sumS2b += s2b;
    sumG2b += g2b;
    sumB2h += b2h;
    originalCost += row.consumptionKwh * fullPrice[t];
    optimizedCost += cost;

    hourly.push({
      t: row.t,
      priceRaw: row.priceSekPerKwh,
      fullPrice: fullPrice[t],
      consumptionKwh: row.consumptionKwh,
      excessSolarKwh: actualSolar,
      solarToBattery: s2b,
      gridToBattery: g2b,
      batteryToHome: b2h,
      soc,
      gridConsumption,
      cost,
    });
  }

  const summary: WindowSummary = {
    originalCost,
    optimizedCost,
    savings: originalCost - optimizedCost,
    totalSolarToBattery: sumS2b,
    totalGridToBattery: sumG2b,
    totalBatteryToHome: sumB2h,
    initialSoc,
    finalSoc: hourly[hourly.length - 1].soc,
    capacityFactor: bounds.capacityFactor,
    effectiveCapacityKwh: bounds.effectiveCapacityKwh,
    solarActualTotal,
    solarEstimatedTotal,
    solarEstimationRmse: usesEstimates ? Math.sqrt(sqErrSum / rows.length) : 0,
  };

  return { hourly, summary };
}
