import type { HourRecord, SolarForecastMethod } from "./types";

/**
 * Precomputed lookup structures over the full dataset, so per-window forecast
 * queries are O(window) instead of O(dataset). Rows must be in ascending time
 * order (they are — the dataset is validated on load).
 */
export interface ForecastIndex {
  hours: HourRecord[];
  /** For each hour-of-day 0-23, indices of rows with that hour, in file order. */
  byHourOfDay: number[][];
}

export function buildForecastIndex(hours: HourRecord[]): ForecastIndex {
  const byHourOfDay: number[][] = Array.from({ length: 24 }, () => []);
  for (let i = 0; i < hours.length; i++) {
    byHourOfDay[hours[i].hour].push(i);
  }
  return { hours, byHourOfDay };
}

/** Number of entries in `sortedIdx` whose row time is strictly before `tMs`. */
function countBefore(index: ForecastIndex, sortedIdx: number[], tMs: number): number {
  let lo = 0;
  let hi = sortedIdx.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (index.hours[sortedIdx[mid]].t < tMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Mean excess solar of the last `n` rows before `tMs` with the given hour-of-day. */
function tailMeanForHour(
  index: ForecastIndex,
  hourOfDay: number,
  tMs: number,
  n: number,
): number | null {
  const idx = index.byHourOfDay[hourOfDay];
  const end = countBefore(index, idx, tMs);
  if (end === 0) return null;
  const start = Math.max(0, end - n);
  let sum = 0;
  for (let i = start; i < end; i++) sum += index.hours[idx[i]].excessSolarKwh;
  return sum / (end - start);
}

/** Last known excess solar before `tMs` for the given hour-of-day. */
function lastForHour(index: ForecastIndex, hourOfDay: number, tMs: number): number | null {
  const idx = index.byHourOfDay[hourOfDay];
  const end = countBefore(index, idx, tMs);
  if (end === 0) return null;
  return index.hours[idx[end - 1]].excessSolarKwh;
}

/**
 * Estimate excess solar for the planning window, mirroring the Python
 * estimate_solar_production() (see docs/PRIOR_WORK.md for method semantics).
 *
 * @param optIdx index of the window's first row (the planning-hour row)
 */
export function estimateSolar(
  index: ForecastIndex,
  optIdx: number,
  windowHours: number,
  method: SolarForecastMethod,
): number[] {
  const { hours } = index;
  const window = hours.slice(optIdx, optIdx + windowHours);
  const optTime = hours[optIdx].t;
  const optDay = hours[optIdx].day;

  if (method === "perfect") {
    return window.map((r) => r.excessSolarKwh);
  }

  // Hybrid scale factor: today's observed morning vs the trailing average of
  // the same morning hours (3 days' worth of rows), computed once per window.
  let hybridScale = 1.0;
  if (method === "hybrid") {
    // Today's rows before the planning hour (contiguous, scan back from optIdx).
    let dayStart = optIdx;
    while (dayStart > 0 && hours[dayStart - 1].day === optDay) dayStart--;
    const todayMorning = hours.slice(dayStart, optIdx);
    const morningHours = new Set(todayMorning.map((r) => r.hour));

    if (morningHours.size > 0 && todayMorning.length > 0) {
      // Last morningHours.size * 3 rows before optTime whose hour is a morning hour
      // (includes today's own morning rows, as in the Python model).
      const wanted = morningHours.size * 3;
      let histSum = 0;
      let histCount = 0;
      for (let i = optIdx - 1; i >= 0 && histCount < wanted; i--) {
        if (morningHours.has(hours[i].hour)) {
          histSum += hours[i].excessSolarKwh;
          histCount++;
        }
      }
      if (histCount > 0) {
        const todayAvg =
          todayMorning.reduce((sum, r) => sum + r.excessSolarKwh, 0) / todayMorning.length;
        const histAvg = histSum / histCount;
        hybridScale = histAvg > 0 ? todayAvg / histAvg : 1.0;
      }
    }
  }

  const weightedWeights = [0.1, 0.15, 0.2, 0.25, 0.3];

  return window.map((row) => {
    let estimate: number;
    switch (method) {
      case "simple": {
        estimate = tailMeanForHour(index, row.hour, optTime, 3) ?? 0;
        break;
      }
      case "weighted": {
        const idx = index.byHourOfDay[row.hour];
        const end = countBefore(index, idx, optTime);
        const start = Math.max(0, end - 5);
        const count = end - start;
        if (count === 0) {
          estimate = 0;
        } else {
          const weights = weightedWeights.slice(weightedWeights.length - count);
          const wSum = weights.reduce((a, b) => a + b, 0);
          let acc = 0;
          for (let k = 0; k < count; k++) {
            acc += index.hours[idx[start + k]].excessSolarKwh * (weights[k] / wSum);
          }
          estimate = acc;
        }
        break;
      }
      case "hybrid": {
        const base = tailMeanForHour(index, row.hour, optTime, 3) ?? 0;
        estimate = row.day === optDay ? base * hybridScale : base;
        break;
      }
      case "persistence": {
        estimate = lastForHour(index, row.hour, optTime) ?? 0;
        break;
      }
      default:
        throw new Error(`Unknown solar forecast method: ${method satisfies never}`);
    }
    return Math.max(0, estimate);
  });
}
