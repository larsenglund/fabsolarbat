import type { HourRecord } from "../engine/types";
import type { EnergyRow } from "./parsers/energyCsv";
import type { PriceRow } from "./parsers/priceCsv";

/**
 * Join hourly energy rows with hourly SEK/kWh prices on their (naive)
 * timestamps, producing the engine's canonical HourRecord series plus a
 * validation report. Nothing is silently repaired: every drop and gap is
 * counted and surfaced.
 */
export interface MergeReport {
  energyHours: number;
  priceHours: number;
  matchedHours: number;
  energyWithoutPrice: number;
  priceWithoutEnergy: number;
  /** Missing hours inside the matched range (e.g. DST spring-forward). */
  gaps: number;
  firstDay: string;
  lastDay: string;
  coverageDays: number;
  warnings: string[];
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function mergeEnergyAndPrices(
  energy: EnergyRow[],
  pricesSekPerKwh: PriceRow[],
  extraWarnings: string[] = [],
): { hours: HourRecord[]; report: MergeReport } {
  const priceByT = new Map<number, number>();
  for (const p of pricesSekPerKwh) if (!priceByT.has(p.t)) priceByT.set(p.t, p.value);

  const hours: HourRecord[] = [];
  let energyWithoutPrice = 0;
  for (const e of energy) {
    const price = priceByT.get(e.t);
    if (price === undefined) {
      energyWithoutPrice++;
      continue;
    }
    hours.push({
      t: e.t,
      hour: new Date(e.t).getUTCHours(),
      day: Math.floor(e.t / DAY_MS),
      consumptionKwh: Math.max(0, e.consumptionKwh),
      excessSolarKwh: Math.max(0, e.productionKwh),
      priceSekPerKwh: price,
    });
  }
  hours.sort((a, b) => a.t - b.t);

  if (hours.length < 72) {
    throw new Error(
      `Only ${hours.length} hours have both energy and price data — at least 3 days are needed ` +
        `(and a year gives meaningful results). Check that the two files cover the same period.`,
    );
  }

  let gaps = 0;
  for (let i = 1; i < hours.length; i++) {
    gaps += Math.round((hours[i].t - hours[i - 1].t) / HOUR_MS) - 1;
  }

  const warnings = [...extraWarnings];
  const negCons = energy.filter((e) => e.consumptionKwh < 0).length;
  const negProd = energy.filter((e) => e.productionKwh < 0).length;
  if (negCons > 0) warnings.push(`${negCons} negative consumption values clamped to 0`);
  if (negProd > 0) warnings.push(`${negProd} negative production values clamped to 0`);
  if (gaps > 0) warnings.push(`${gaps} missing hours inside the covered range`);
  const meanPrice = hours.reduce((s, h) => s + h.priceSekPerKwh, 0) / hours.length;
  if (meanPrice > 5 || meanPrice < 0.005) {
    warnings.push(
      `Average price is ${meanPrice.toFixed(3)} SEK/kWh — unusual; double-check the price unit and exchange rate`,
    );
  }
  const coverageDays = Math.round(hours.length / 24);
  if (coverageDays < 360) {
    warnings.push(
      `Dataset covers ~${coverageDays} days, not a full year — annual figures will be extrapolated and seasons may be over- or under-represented`,
    );
  }

  const report: MergeReport = {
    energyHours: energy.length,
    priceHours: pricesSekPerKwh.length,
    matchedHours: hours.length,
    energyWithoutPrice,
    priceWithoutEnergy: pricesSekPerKwh.length - (energy.length - energyWithoutPrice),
    gaps,
    firstDay: new Date(hours[0].t).toISOString().slice(0, 10),
    lastDay: new Date(hours[hours.length - 1].t).toISOString().slice(0, 10),
    coverageDays,
    warnings,
  };

  return { hours, report };
}

/** Build a MergeReport-shaped summary for an already-merged canonical file. */
export function reportForMerged(hours: HourRecord[], warnings: string[] = []): MergeReport {
  let gaps = 0;
  for (let i = 1; i < hours.length; i++) {
    gaps += Math.round((hours[i].t - hours[i - 1].t) / HOUR_MS) - 1;
  }
  const coverageDays = Math.round(hours.length / 24);
  const all = [...warnings];
  if (gaps > 0) all.push(`${gaps} missing hours inside the covered range`);
  if (coverageDays < 360) {
    all.push(
      `Dataset covers ~${coverageDays} days, not a full year — annual figures will be extrapolated and seasons may be over- or under-represented`,
    );
  }
  return {
    energyHours: hours.length,
    priceHours: hours.length,
    matchedHours: hours.length,
    energyWithoutPrice: 0,
    priceWithoutEnergy: 0,
    gaps,
    firstDay: new Date(hours[0].t).toISOString().slice(0, 10),
    lastDay: new Date(hours[hours.length - 1].t).toISOString().slice(0, 10),
    coverageDays,
    warnings: all,
  };
}
