/**
 * Core engine types. The engine is a faithful port of the validated Python
 * model in larsenglund/notes ("elpris batteri", battery_analysis_linear.py +
 * annual_battery_analysis.py) — see docs/PRIOR_WORK.md.
 *
 * Timestamps are "naive local time" encoded as UTC milliseconds
 * (Date.UTC of the literal wall-clock digits). The Python model uses naive
 * pandas datetimes the same way; no timezone conversion ever happens.
 */

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
  /** Multiplier on the spot price, e.g. 1.25 for 25% VAT. */
  vatMultiplier: number;
  /** Grid transfer fee in SEK/kWh (incl. VAT). */
  transferFeeSekPerKwh: number;
  /** Retailer markup in SEK/kWh (påslag), added like the transfer fee. */
  fixedMarkupSekPerKwh: number;
}

export interface StrategyParams {
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
    vatMultiplier: 1.25,
    transferFeeSekPerKwh: 0.685,
    fixedMarkupSekPerKwh: 0,
  },
  strategy: {
    planningHour: 13,
    windowHours: 35,
    solarForecast: "hybrid",
    gridChargePenaltySekPerKwh: 0.001,
  },
};

/** One hour of the executed schedule within a window. */
export interface HourResult {
  t: number;
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
  cost: number;
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
  dailyCycles: number;
  totalCycles: number;
  capacityFactor: number;
  effectiveCapacityKwh: number;
  solarActualTotal: number;
  solarEstimatedTotal: number;
  solarEstimationError: number;
  solarEstimationRmse: number;
}

export interface AnnualResult {
  days: DayResult[];
  totalOriginalCost: number;
  totalOptimizedCost: number;
  totalSavings: number;
  savingsPct: number;
  totalCycles: number;
}
