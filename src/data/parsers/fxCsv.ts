import {
  csvLines,
  detectDelimiter,
  naiveDateKey,
  parseLocaleNumber,
  splitCsvLine,
} from "./csvCommon";

/**
 * Daily EUR→SEK exchange rates: two columns, date (YYYY-MM-DD) and rate.
 * Example: `Date,EUR_to_SEK_Rate` / `2024-01-01,11.1545`.
 */
export interface FxTable {
  /** dateKey (YYYY-MM-DD) → rate */
  rates: Map<string, number>;
}

export function parseFxCsv(text: string): FxTable {
  const lines = csvLines(text);
  if (lines.length < 2) throw new Error("Exchange-rate file: no data rows found");
  const delim = detectDelimiter(lines[0]);
  const rates = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i], delim);
    const date = (parts[0] ?? "").slice(0, 10);
    const rate = parseLocaleNumber(parts[1] ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(rate) && rate > 0) {
      rates.set(date, rate);
    }
  }
  if (rates.size === 0) {
    throw new Error(
      "Exchange-rate file: no parsable rows. Expected two columns like `2024-01-01,11.1545`.",
    );
  }
  return { rates };
}

/** Rate lookup with carry-forward for missing dates (weekends/holidays). */
export function fxLookup(table: FxTable): (utcMs: number) => number {
  const sorted = [...table.rates.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return (utcMs) => {
    const key = naiveDateKey(utcMs);
    const exact = table.rates.get(key);
    if (exact !== undefined) return exact;
    let best = sorted[0][1];
    for (const [d, r] of sorted) {
      if (d <= key) best = r;
      else break;
    }
    return best;
  };
}
