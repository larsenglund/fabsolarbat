/**
 * Core engine types. The engine is a faithful port of the validated Python
 * model in larsenglund/notes ("elpris batteri", battery_analysis_linear.py +
 * annual_battery_analysis.py) — see docs/PRIOR_WORK.md.
 *
 * Timestamps are "naive local time" encoded as UTC milliseconds
 * (Date.UTC of the literal wall-clock digits). The Python model uses naive
 * pandas datetimes the same way; no timezone conversion ever happens.
 */

import type { PeakSample, PowerTariffId } from "./powerTariff";

export interface HourRecord {
  /** Naive wall-clock time of the hour start, as Date.UTC ms. */
  t: number;
  /** Hour of day 0-23 (redundant with t, precomputed for lookups). */
  hour: number;
  /** Calendar day as floor(t / 86_400_000) (naive date key). */
  day: number;
  consumptionKwh: number;
  excessSolarKwh: number;
  /** Spot price in SEK/kWh, excluding VAT and fees. */
  priceSekPerKwh: number;
}

export type SolarForecastMethod = "perfect" | "simple" | "weighted" | "hybrid" | "persistence";

export interface BatteryParams {
  /** Usable capacity in kWh (before degradation). */
  usableCapacityKwh: number;
  /** Max charge and discharge power in kW. */
  maxPowerKw: number;
  /** One-way AC efficiency (applied on charge and again on discharge). */
  acEfficiency: number;
  /** Max charge as percent of (degraded) capacity, e.g. 100. */
  maxChargePercent: number;
  /** Max depth of discharge in percent, e.g. 90 → SoC floor at 10%. */
  depthOfDischargePercent: number;
  /** Full cycles until capacity reaches eolCapacityPercent. */
  cyclesToEol: number;
  /** Capacity in percent of nominal at end of life, e.g. 70. */
  eolCapacityPercent: number;
}

export interface TariffParams {
  /**
   * What-if multiplier on every hourly spot price in the dataset (1 = as
   * recorded). Scales the price level and the daily price swings together;
   * negative prices get more negative. Applied before VAT and fees, to both
   * purchases and (sell-at-spot) exports.
   */
  spotPriceScale: number;
  /** Multiplier on the spot price, e.g. 1.25 for 25% VAT. */
  vatMultiplier: number;
  /** Grid transfer fee in SEK/kWh (incl. VAT). */
  transferFeeSekPerKwh: number;
  /** Retailer markup in SEK/kWh (påslag), added like the transfer fee. */
  fixedMarkupSekPerKwh: number;
  /**
   * Added to the spot price for exported solar in the sell-at-spot model
   * (nätnytta and any retailer bonus). Sweden's 60 öre/kWh skattereduktion
   * has been abolished and is deliberately NOT part of the default.
   */
  sellBonusSekPerKwh: number;
  /**
   * Monthly power tariff (effektavgift) of the grid operator, or null for
   * none. When set, the optimizer also shaves the tariff's measured peaks and
   * the fee difference is part of the savings.
   */
  powerTariff: PowerTariffId | null;
}

/**
 * Market model. "no-sell": excess solar not charged into the battery is
 * wasted (no export revenue) — the original Python model. "sell-at-spot":
 * exported solar earns spot + sellBonus, in the baseline AND with the
 * battery, so diverting solar into the battery carries its real opportunity
 * cost.
 */
export type MarketModel = "no-sell" | "sell-at-spot";

export interface StrategyParams {
  /** Market model for excess solar. */
  model: MarketModel;
  /** Hour of day when day-ahead prices become known (13 in the Nordics). */
  planningHour: number;
  /** Planning window length in hours (35 = 13:00 → 24:00 next day). */
  windowHours: number;
  /**
   * Solar forecast used during planning. null = plan on actual future solar
   * (perfect foreknowledge, and skip the execution-adjustment pass).
   */
  solarForecast: SolarForecastMethod | null;
  /** Tie-break penalty in SEK/kWh added to grid charging (prefers solar). */
  gridChargePenaltySekPerKwh: number;
}

export interface EngineParams {
  battery: BatteryParams;
  tariff: TariffParams;
  strategy: StrategyParams;
}

/** Defaults identical to the Python reference analysis (golden run). */
export const DEFAULT_PARAMS: EngineParams = {
  battery: {
    usableCapacityKwh: 13.82,
    maxPowerKw: 7.68,
    acEfficiency: 0.95,
    maxChargePercent: 100,
    depthOfDischargePercent: 90,
    cyclesToEol: 6000,
    eolCapacityPercent: 70,
  },
  tariff: {
    spotPriceScale: 1,
    vatMultiplier: 1.25,
    transferFeeSekPerKwh: 0.685,
    fixedMarkupSekPerKwh: 0,
    sellBonusSekPerKwh: 0.05,
    powerTariff: null,
  },
  strategy: {
    model: "no-sell",
    planningHour: 13,
    windowHours: 35,
    solarForecast: "hybrid",
    gridChargePenaltySekPerKwh: 0.001,
  },
};

/** One hour of the executed schedule within a window. */
export interface HourResult {
  t: number;
  /** Spot price in SEK/kWh excl. VAT, after spotPriceScale. */
  priceRaw: number;
  fullPrice: number;
  consumptionKwh: number;
  excessSolarKwh: number;
  solarToBattery: number;
  gridToBattery: number;
  batteryToHome: number;
  /** SoC in kWh after this hour's actions. */
  soc: number;
  gridConsumption: number;
  /** Solar exported to grid this hour (excess minus battery charging). */
  exportKwh: number;
  /** Net cost with the battery: purchases minus export revenue. */
  cost: number;
  /** Net cost without a battery: purchases minus full-export revenue. */
  baselineCost: number;
}

export interface WindowSummary {
  originalCost: number;
  optimizedCost: number;
  savings: number;
  totalSolarToBattery: number;
  totalGridToBattery: number;
  totalBatteryToHome: number;
  initialSoc: number;
  finalSoc: number;
  capacityFactor: number;
  effectiveCapacityKwh: number;
  solarActualTotal: number;
  solarEstimatedTotal: number;
  solarEstimationRmse: number;
}

export interface DayResult {
  dayNumber: number;
  /** Naive ms of the window start (planning hour). */
  t: number;
  month: number;
  /**
   * Window-summed metrics (all 35 h) — kept for parity with the Python golden
   * data. NOTE: consecutive windows overlap by 11 h, so summing these across
   * days double-counts. Use the executed* fields for honest aggregates.
   */
  originalCost: number;
  optimizedCost: number;
  savings: number;
  savingsPct: number;
  solarToBattery: number;
  gridToBattery: number;
  batteryToHome: number;
  initialSoc: number;
  finalSoc: number;
  minPrice: number;
  maxPrice: number;
  priceSpread: number;
  /** Window-summed discharge in cycles (35 h; Python parity). */
  dailyCycles: number;
  /**
   * Cumulative cycles driving degradation after this day: executed discharge
   * only (window-summed in the pythonParity mode).
   */
  totalCycles: number;
  capacityFactor: number;
  effectiveCapacityKwh: number;
  solarActualTotal: number;
  solarEstimatedTotal: number;
  solarEstimationError: number;
  solarEstimationRmse: number;
  /**
   * Executed-hours metrics: only the hours this window actually governs —
   * the first 24 h (the tail is re-planned by the next day's window), or the
   * full window on the final simulated day. Summing these across days counts
   * every calendar hour exactly once.
   */
  executedHours: number;
  executedOriginalCost: number;
  executedOptimizedCost: number;
  executedSavings: number;
  executedBatteryToHome: number;
  /**
   * Full-window hourly schedule (35 h incl. the re-planned tail), present only
   * when SimulateOptions.retainHourly is set. Index < executedHours ⇒ executed.
   */
  hourly?: HourResult[];
}

/** One month of the power tariff, without and with the battery. */
export interface PowerFeeMonth {
  /** year·12 + month (0-based). */
  monthKey: number;
  /** Calendar month 1-12. */
  month: number;
  priceSekPerKw: number;
  baselineKw: number;
  optimizedKw: number;
  baselineFee: number;
  optimizedFee: number;
  savings: number;
  /** The measured peaks that set each bill, highest first. */
  baselinePeaks: PeakSample[];
  optimizedPeaks: PeakSample[];
}

export interface PowerFeeSummary {
  tariffId: PowerTariffId;
  /** Months touched by the executed hours, ascending. */
  months: PowerFeeMonth[];
  baselineFee: number;
  optimizedFee: number;
  savings: number;
}

/**
 * How savings respond to capacity fade, measured by simulating the same year
 * a second time with a smaller battery (same power, efficiency and limits).
 * Savings are far less sensitive than capacity: most days the battery is
 * limited by price spreads, power or consumption, not by its size, so the
 * capacity lost first is the least valuable.
 */
export interface CapacitySensitivity {
  /** Average capacity factor behind the main run's savings (in-year fade included). */
  referenceFactor: number;
  /** Capacity factor of the re-simulated battery (its end-of-life capacity). */
  reducedFactor: number;
  /** Savings of the reduced run as a fraction of the main run's, clamped to [0, 1]. */
  reducedSavingsRatio: number;
}

export interface AnnualResult {
  days: DayResult[];
  /**
   * Window-summed totals (Python-parity numbers). Inflated ~1.5× by the 11 h
   * window overlap — never present these as annual figures.
   */
  totalOriginalCost: number;
  totalOptimizedCost: number;
  totalSavings: number;
  savingsPct: number;
  /** Final cumulative cycle count that drove degradation (see DayResult.totalCycles). */
  totalCycles: number;
  /**
   * Honest annual totals: every simulated calendar hour counted once. With a
   * power tariff these include the monthly power fees (so they exceed the sum
   * of the per-day executed figures, which are energy-only).
   */
  executedOriginalCost: number;
  executedOptimizedCost: number;
  executedSavings: number;
  executedSavingsPct: number;
  /** Energy (per-kWh) part of executedSavings: Σ days' executedSavings. */
  executedEnergySavings: number;
  /** Power-tariff (effektavgift) accounting over the executed hours, or null. */
  powerFee: PowerFeeSummary | null;
  /** Executed calendar hours (Σ days' executedHours). */
  executedHours: number;
  /** Set by simulateScenario (the app's run); absent from a bare simulateYear. */
  capacitySensitivity?: CapacitySensitivity | null;
  /** Cycles from executed discharge only — use this for finance projections. */
  executedCycles: number;
}
