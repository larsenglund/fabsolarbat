import { csvLines, detectDelimiter, splitCsvLine, swedishUtcOffsetHours } from "./csvCommon";
import { parseNaiveTimestamp } from "./mergedCsv";

/**
 * Day-ahead price file. Two shapes are recognized:
 *  1. ENTSO-E transparency export: quoted, comma-separated, an "MTU (UTC)"
 *     hour-range column ("01/01/2024 00:00:00 - 01/01/2024 01:00:00") and a
 *     "Day-ahead Price (EUR/MWh)" column.
 *  2. Simple two-column: datetime,price — unit chosen by the caller.
 */
export type PriceUnit = "eur-mwh" | "sek-kwh" | "ore-kwh";

export interface PriceRow {
  /** Naive timestamp as found in the file (possibly UTC for ENTSO-E). */
  t: number;
  /** Price in the file's unit. */
  value: number;
}

export interface PriceParseResult {
  rows: PriceRow[];
  /** Unit detected from headers, or null if the caller must choose. */
  detectedUnit: PriceUnit | null;
  /** True when the timestamp header declares UTC (ENTSO-E). */
  timestampsAreUtc: boolean;
  warnings: string[];
}

const RANGE_TS = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/;

function parseRangeTimestamp(s: string): number | null {
  const m = RANGE_TS.exec(s.trim());
  if (!m) return null;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
}

export function parsePriceCsv(text: string): PriceParseResult {
  const lines = csvLines(text);
  if (lines.length < 2) throw new Error("Price file: no data rows found");
  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim);

  const tsCol = headers.findIndex((h) => /mtu|datum|date|tid|time/i.test(h));
  const priceCol = headers.findIndex((h) => /price|pris/i.test(h));
  if (tsCol === -1 || priceCol === -1) {
    throw new Error(
      `Price file: could not identify the ${tsCol === -1 ? "timestamp" : "price"} column. ` +
        `Found headers: ${headers.join(" | ")}. Expected e.g. an ENTSO-E export with ` +
        `"MTU (UTC)" and "Day-ahead Price (EUR/MWh)", or datetime,price.`,
    );
  }

  const priceHeader = headers[priceCol];
  let detectedUnit: PriceUnit | null = null;
  if (/eur\s*\/\s*mwh/i.test(priceHeader)) detectedUnit = "eur-mwh";
  else if (/sek\s*\/\s*kwh|kr\s*\/\s*kwh/i.test(priceHeader)) detectedUnit = "sek-kwh";
  else if (/öre|ore/i.test(priceHeader)) detectedUnit = "ore-kwh";
  const timestampsAreUtc = /utc/i.test(headers[tsCol]);

  const warnings: string[] = [];
  const rows: PriceRow[] = [];
  let emptyPrices = 0;
  let badRows = 0;
  const seen = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i], delim);
    const raw = parts[tsCol] ?? "";
    const t = parseRangeTimestamp(raw) ?? parseNaiveTimestamp(raw);
    if (t === null) {
      badRows++;
      continue;
    }
    if (seen.has(t)) continue;
    const value = Number(parts[priceCol] ?? "");
    if (parts[priceCol] === "" || Number.isNaN(value)) {
      emptyPrices++;
      continue;
    }
    seen.add(t);
    rows.push({ t, value });
  }

  if (rows.length === 0) throw new Error("Price file: no parsable rows");
  rows.sort((a, b) => a.t - b.t);
  if (badRows > 0) warnings.push(`${badRows} rows had unreadable timestamps and were skipped`);
  if (emptyPrices > 0) warnings.push(`${emptyPrices} rows without a price were skipped`);

  const meanAbs = rows.reduce((s, r) => s + Math.abs(r.value), 0) / rows.length;
  if (detectedUnit === null) {
    if (meanAbs > 20) {
      warnings.push(
        `Prices average ${meanAbs.toFixed(1)} — that magnitude suggests EUR/MWh or öre/kWh rather than SEK/kWh. Pick the unit carefully.`,
      );
    }
  }

  return { rows, detectedUnit, timestampsAreUtc, warnings };
}

/**
 * Convert parsed price rows to SEK/kWh, optionally shifting UTC timestamps to
 * Swedish local time. `fx(dateKey)` supplies the EUR→SEK rate for a date when
 * the unit is EUR/MWh (a fixed rate is just a constant function).
 */
export function toSekPerKwh(
  rows: PriceRow[],
  unit: PriceUnit,
  fx: (utcMs: number) => number,
  shiftUtcToLocal: boolean,
): PriceRow[] {
  return rows.map((r) => {
    let value: number;
    switch (unit) {
      case "eur-mwh":
        value = (r.value * fx(r.t)) / 1000;
        break;
      case "ore-kwh":
        value = r.value / 100;
        break;
      case "sek-kwh":
        value = r.value;
        break;
      default:
        throw new Error(`Unknown price unit: ${unit satisfies never}`);
    }
    const t = shiftUtcToLocal ? r.t + swedishUtcOffsetHours(r.t) * 3_600_000 : r.t;
    return { t, value };
  });
}
