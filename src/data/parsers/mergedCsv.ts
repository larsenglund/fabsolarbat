import type { HourRecord } from "../../engine/types";

const DAY_MS = 86_400_000;

/**
 * Parse the canonical merged dataset format:
 *   datetime,excess_solar_kwh,consumption_kwh,price_sek_per_kwh
 *   2024-01-01 00:00,0.0,3.61,0.31745707
 *
 * Timestamps are naive local wall-clock time and are encoded as Date.UTC of
 * the literal digits (no timezone conversion) — see engine/types.ts.
 */
export function parseMergedCsv(text: string): HourRecord[] {
  const lines = text.split(/\r?\n/);
  const records: HourRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    const parts = line.split(",");
    if (parts.length !== 4) {
      throw new Error(`Line ${i + 1}: expected 4 columns, got ${parts.length}`);
    }
    const t = parseNaiveTimestamp(parts[0]);
    const excessSolarKwh = Number(parts[1]);
    const consumptionKwh = Number(parts[2]);
    const priceSekPerKwh = Number(parts[3]);
    if (
      t === null ||
      !Number.isFinite(excessSolarKwh) ||
      !Number.isFinite(consumptionKwh) ||
      !Number.isFinite(priceSekPerKwh)
    ) {
      throw new Error(`Line ${i + 1}: could not parse "${line}"`);
    }
    records.push({
      t,
      hour: new Date(t).getUTCHours(),
      day: Math.floor(t / DAY_MS),
      excessSolarKwh,
      consumptionKwh,
      priceSekPerKwh,
    });
  }

  for (let i = 1; i < records.length; i++) {
    if (records[i].t <= records[i - 1].t) {
      throw new Error(`Timestamps not strictly increasing at row ${i + 1}`);
    }
  }
  return records;
}

/** "YYYY-MM-DD HH:MM" (or with seconds / 'T' separator) → naive-UTC ms. */
export function parseNaiveTimestamp(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  );
}
