/**
 * Power tariffs (effektavgift): a monthly grid fee proportional to the
 * household's peak grid draw, on top of the per-kWh transfer fee.
 *
 * A tariff is described declaratively — which hours count (and with what
 * weight), how many peaks are averaged per month, whether only one peak per
 * calendar day may count, and the price per kW for each calendar month. The
 * same definition drives both the exact after-the-fact accounting
 * (monthlyPowerFees) and the peak terms added to each planning window's LP
 * (see lp.ts / simulate.ts), so what the optimizer aims at is exactly what the
 * bill charges.
 *
 * Grid draw per hour is energy in kWh over one hour, i.e. the hourly average
 * power in kW — the unit grid operators measure peaks in.
 */

import { isSwedishPublicHoliday } from "./holidays";

export const POWER_TARIFF_IDS = ["fev-2025"] as const;
export type PowerTariffId = (typeof POWER_TARIFF_IDS)[number];

export interface PowerTariffDef {
  id: PowerTariffId;
  /** Short name for selects and the assumptions bar. */
  label: string;
  /** Grid operator. */
  operator: string;
  /** Number of peaks averaged into the month's billed power (kW). */
  peaksPerMonth: number;
  /** Only the highest hour of each calendar day can be one of the peaks. */
  onePeakPerDay: boolean;
  /**
   * Weight with which an hour's grid draw counts toward the peaks (0 = the
   * hour is not measured, 1 = full, 0.5 = half, …).
   * @param t naive local hour start (Date.UTC of the wall-clock digits)
   */
  hourWeight: (t: number) => number;
  /** Price in SEK per kW and month incl. VAT, index 0 = January. */
  priceSekPerKwByMonth: readonly number[];
  /** Human-readable summary of the rules, shown in the UI. */
  rules: string;
  sourceUrl: string;
  /**
   * The operator's per-kWh charge that goes with this tariff, incl. energy
   * tax and VAT (the model's "grid transfer fee"), offered as a one-click
   * update since operators cut the per-kWh fee when adding a power fee.
   */
  transferFeeSekPerKwh: number;
  /** Plain-text breakdown of transferFeeSekPerKwh. */
  transferFeeNote: string;
}

/**
 * Falu Energi & Vatten (Falu Elnät), in force since 1 November 2025 and kept
 * for the 2026/27 season (fev.se/el/elnat/effektavgift.html,
 * fev.se/el/elnat/elnatspriser-privat.html):
 * - billed power = mean of the month's three highest hourly averages, on
 *   three different days;
 * - measured weekdays 07:00–19:00, i.e. the hours 07–08 through 18–19
 *   (data rows are labeled by hour start: 07:00 … 18:00), excluding public
 *   holidays, julafton and nyårsafton;
 * - 75 kr/kW per month incl. VAT (60 kr excl.) November–March, the same for
 *   every fuse size; 0 kr/kW April–October.
 * The per-kWh transfer fee was lowered to 11.25 öre incl. VAT at the same
 * time; energy tax (45 öre/kWh incl. VAT in 2026) is billed on top.
 */
function fevHourWeight(t: number): number {
  const d = new Date(t);
  const month = d.getUTCMonth();
  if (month >= 3 && month <= 9) return 0; // April–October: no power fee
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return 0;
  const hour = d.getUTCHours();
  if (hour < 7 || hour >= 19) return 0;
  const date = d.getUTCDate();
  if (month === 11 && (date === 24 || date === 31)) return 0; // julafton, nyårsafton
  if (isSwedishPublicHoliday(t)) return 0;
  return 1;
}

export const POWER_TARIFFS: Record<PowerTariffId, PowerTariffDef> = {
  "fev-2025": {
    id: "fev-2025",
    label: "Falu Energi & Vatten",
    operator: "Falu Energi & Vatten",
    peaksPerMonth: 3,
    onePeakPerDay: true,
    hourWeight: fevHourWeight,
    priceSekPerKwByMonth: [75, 75, 75, 0, 0, 0, 0, 0, 0, 0, 75, 75],
    rules:
      "In force since 1 November 2025: 75 kr/kW per month (incl. VAT) on the average of the month's three highest hourly power draws, on three different days. Only weekday hours between 07:00 and 19:00 count — 07–08 through 18–19 (not public holidays, Christmas Eve or New Year's Eve), and only November–March; April–October the fee is 0.",
    sourceUrl: "https://fev.se/el/elnat/effektavgift.html",
    transferFeeSekPerKwh: 0.5625,
    transferFeeNote: "11.25 öre transfer fee + 45 öre energy tax, both incl. VAT (2026)",
  },
};

export function getPowerTariff(id: PowerTariffId | null): PowerTariffDef | null {
  return id ? (POWER_TARIFFS[id] ?? null) : null;
}

const DAY_MS = 86_400_000;

/** Calendar-month key of a naive timestamp: year·12 + month (0-based). */
export function monthKeyOf(t: number): number {
  const d = new Date(t);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Calendar-day key of a naive timestamp. */
export function dayKeyOf(t: number): number {
  return Math.floor(t / DAY_MS);
}

/** "2024-03" style label for a month key. */
export function monthLabel(key: number): string {
  const year = Math.floor(key / 12);
  return `${year}-${String((key % 12) + 1).padStart(2, "0")}`;
}

export function priceForMonth(def: PowerTariffDef, monthKey: number): number {
  return def.priceSekPerKwByMonth[monthKey % 12];
}

/** One measured peak candidate: an hour (or a day's highest hour). */
export interface PeakSample {
  t: number;
  /** Weighted grid draw in kW. */
  kw: number;
}

export interface MonthPowerFee {
  monthKey: number;
  priceSekPerKw: number;
  /** The peaks that set the fee, highest first. */
  peaks: PeakSample[];
  /** Billed power: mean of the top `peaksPerMonth` samples (missing ones count as 0). */
  billedKw: number;
  feeSek: number;
}

/**
 * Exact monthly power fees for an hourly grid-draw series.
 *
 * @param times naive hour starts, ascending
 * @param gridKwh grid draw per hour (kWh = average kW)
 */
export function monthlyPowerFees(
  def: PowerTariffDef,
  times: readonly number[],
  gridKwh: readonly number[],
): MonthPowerFee[] {
  const byMonth = new Map<number, Map<number, PeakSample>>();
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const month = monthKeyOf(t);
    let samples = byMonth.get(month);
    if (!samples) {
      samples = new Map();
      byMonth.set(month, samples);
    }
    const w = def.hourWeight(t);
    // Unmeasured hours still register the month (fee 0 if nothing counts).
    if (w <= 0) continue;
    const kw = w * Math.max(0, gridKwh[i]);
    // One sample per day, or one per hour.
    const key = def.onePeakPerDay ? dayKeyOf(t) : t;
    const prev = samples.get(key);
    if (!prev || kw > prev.kw) samples.set(key, { t, kw });
  }

  const out: MonthPowerFee[] = [];
  for (const [monthKey, samples] of [...byMonth].sort((a, b) => a[0] - b[0])) {
    const peaks = [...samples.values()]
      .sort((a, b) => b.kw - a.kw || a.t - b.t)
      .slice(0, def.peaksPerMonth);
    const billedKw = peaks.reduce((s, p) => s + p.kw, 0) / def.peaksPerMonth;
    const priceSekPerKw = priceForMonth(def, monthKey);
    out.push({ monthKey, priceSekPerKw, peaks, billedKw, feeSek: billedKw * priceSekPerKw });
  }
  return out;
}

/**
 * Peak state carried between planning windows: what has already been
 * executed this month, so the LP only pays for peaks that would actually
 * raise the bill.
 */
export class PeakTracker {
  /** month → sample key (day or hour) → highest weighted kW executed so far. */
  private readonly samples = new Map<number, Map<number, number>>();
  private readonly def: PowerTariffDef;

  constructor(def: PowerTariffDef) {
    this.def = def;
  }

  /** Record one executed hour's grid draw. */
  record(t: number, gridKwh: number): void {
    const w = this.def.hourWeight(t);
    if (w <= 0) return;
    const month = monthKeyOf(t);
    let m = this.samples.get(month);
    if (!m) {
      m = new Map();
      this.samples.set(month, m);
    }
    const key = this.def.onePeakPerDay ? dayKeyOf(t) : t;
    const kw = w * Math.max(0, gridKwh);
    m.set(key, Math.max(m.get(key) ?? 0, kw));
  }

  /**
   * LP input for a window: one peak group per measured day (one-per-day
   * tariffs) or per measured hour, the executed floor of each group (a day
   * whose morning already happened), and per month the top executed samples
   * outside the window — only those can compete with the window's peaks.
   */
  windowInput(times: readonly number[]): PeakLpInput {
    const { def } = this;
    const monthIndex = new Map<number, number>();
    const months: PeakLpMonth[] = [];
    const groupIndex = new Map<number, number>();
    const groups: PeakLpGroup[] = [];
    const hourGroup: number[] = [];
    const hourWeight: number[] = [];

    for (const t of times) {
      const w = def.hourWeight(t);
      hourWeight.push(w);
      if (w <= 0) {
        hourGroup.push(-1);
        continue;
      }
      const month = monthKeyOf(t);
      let mi = monthIndex.get(month);
      if (mi === undefined) {
        mi = months.length;
        monthIndex.set(month, mi);
        months.push({ monthKey: month, priceSekPerKw: priceForMonth(def, month), history: [] });
      }
      const key = def.onePeakPerDay ? dayKeyOf(t) : t;
      let gi = groupIndex.get(key);
      if (gi === undefined) {
        gi = groups.length;
        groupIndex.set(key, gi);
        groups.push({ month: mi, floorKw: this.samples.get(month)?.get(key) ?? 0 });
      }
      hourGroup.push(gi);
    }

    // History: executed samples of each month not represented by a window
    // group; only the top N can ever be among the month's N peaks.
    const inWindow = new Set(groupIndex.keys());
    for (const m of months) {
      const executed = this.samples.get(m.monthKey);
      if (!executed) continue;
      const values: number[] = [];
      for (const [key, kw] of executed) if (!inWindow.has(key)) values.push(kw);
      values.sort((a, b) => b - a);
      m.history = values.slice(0, def.peaksPerMonth);
    }

    return { peaksPerMonth: def.peaksPerMonth, months, groups, hourGroup, hourWeight };
  }
}

export interface PeakLpMonth {
  monthKey: number;
  priceSekPerKw: number;
  /** Top executed samples (kW) outside the window, highest first. */
  history: number[];
}

export interface PeakLpGroup {
  /** Index into PeakLpInput.months. */
  month: number;
  /** Already-executed weighted draw of this day/hour (kW); the peak can't go below it. */
  floorKw: number;
}

/**
 * Peak-fee extension of one window's LP. For each month m the fee is
 * price_m · (sum of the N largest samples)/N, where the samples are the
 * window's groups and the month's executed history. The sum of the N largest
 * values is convex and LP-representable:
 *   topN(x) = min over u ≥ 0 of  N·u + Σ max(0, x_i − u)
 * (u ≥ 0 pads months with fewer than N samples with zeros).
 */
export interface PeakLpInput {
  peaksPerMonth: number;
  months: PeakLpMonth[];
  groups: PeakLpGroup[];
  /** Per window hour: index into groups, or −1 when the hour is not measured. */
  hourGroup: number[];
  /** Per window hour: measurement weight. */
  hourWeight: number[];
}
