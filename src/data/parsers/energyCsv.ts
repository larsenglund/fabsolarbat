import { csvLines, detectDelimiter, parseLocaleNumber, splitCsvLine } from "./csvCommon";
import { parseNaiveTimestamp } from "./mergedCsv";

/**
 * Household energy export, as produced by Swedish grid operators and energy
 * portals: one row per hour with a timestamp, consumption from grid, and
 * (optionally) excess solar production exported to grid. Handles semicolon or
 * comma delimiters, quoted fields, BOM, and Swedish decimal commas.
 */
export interface EnergyRow {
  t: number;
  consumptionKwh: number;
  productionKwh: number;
}

export interface EnergyParseResult {
  rows: EnergyRow[];
  hasProduction: boolean;
  warnings: string[];
}

const TS_HEADER = /datum|date|tid|time/i;
const PRODUCTION_HEADER = /produktion|production|export|såld|sold/i;
const CONSUMPTION_HEADER = /förbrukning|forbrukning|consumption|import|köpt|el kwh|^el$/i;

export function parseEnergyCsv(text: string): EnergyParseResult {
  const lines = csvLines(text);
  if (lines.length < 2) throw new Error("Energy file: no data rows found");
  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim);

  const tsCol = headers.findIndex((h) => TS_HEADER.test(h));
  const prodCol = headers.findIndex((h) => PRODUCTION_HEADER.test(h));
  const consCol = headers.findIndex((h, i) => i !== prodCol && CONSUMPTION_HEADER.test(h));
  if (tsCol === -1 || consCol === -1) {
    throw new Error(
      `Energy file: could not identify the ${tsCol === -1 ? "timestamp" : "consumption"} column. ` +
        `Found headers: ${headers.join(" | ")}. Expected e.g. "Datum";"Produktion";"El kWh".`,
    );
  }

  const warnings: string[] = [];
  const rows: EnergyRow[] = [];
  let emptyValues = 0;
  let badRows = 0;
  let duplicates = 0;
  const seen = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i], delim);
    const t = parseNaiveTimestamp(parts[tsCol] ?? "");
    if (t === null) {
      badRows++;
      continue;
    }
    if (seen.has(t)) {
      duplicates++; // DST fall-back hour appears twice — keep the first
      continue;
    }
    seen.add(t);
    let cons = parseLocaleNumber(parts[consCol] ?? "");
    let prod = prodCol === -1 ? 0 : parseLocaleNumber(parts[prodCol] ?? "");
    if (Number.isNaN(cons)) {
      emptyValues++;
      cons = 0;
    }
    if (Number.isNaN(prod)) {
      emptyValues++;
      prod = 0;
    }
    rows.push({ t, consumptionKwh: cons, productionKwh: prod });
  }

  if (rows.length === 0) throw new Error("Energy file: no parsable rows");
  rows.sort((a, b) => a.t - b.t);

  if (badRows > 0) warnings.push(`${badRows} rows had unreadable timestamps and were skipped`);
  if (duplicates > 0) warnings.push(`${duplicates} duplicate hours removed (DST fall-back)`);
  if (emptyValues > 0) warnings.push(`${emptyValues} empty values treated as 0`);
  const meanCons = rows.reduce((s, r) => s + r.consumptionKwh, 0) / rows.length;
  if (meanCons > 100) {
    warnings.push(
      `Average consumption is ${meanCons.toFixed(0)} per hour — that looks like watts, not kWh. Check the unit.`,
    );
  }
  if (prodCol === -1) {
    warnings.push("No production/export column found — solar is assumed to be 0");
  }

  return { rows, hasProduction: prodCol !== -1, warnings };
}
