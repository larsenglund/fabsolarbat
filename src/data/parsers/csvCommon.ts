/** Shared low-level helpers for the known upload formats. */

/** Strip a UTF-8 BOM and split into non-empty lines. */
export function csvLines(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
}

/** Detect ; vs , as delimiter from a header line (quotes-aware). */
export function detectDelimiter(headerLine: string): ";" | "," {
  const semis = splitCsvLine(headerLine, ";").length;
  const commas = splitCsvLine(headerLine, ",").length;
  return semis >= commas ? ";" : ",";
}

/** Split one CSV line on a delimiter, honoring double-quoted fields. */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Parse a number that may use a Swedish decimal comma. Empty → NaN. */
export function parseLocaleNumber(s: string): number {
  const t = s.trim();
  if (t === "") return Number.NaN;
  return Number(t.replace(/\s/g, "").replace(",", "."));
}

/** Naive-UTC ms → naive date parts, for FX lookups and DST rules. */
export function naiveDateKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Offset (hours) from UTC to Swedish local time at a given UTC instant:
 * +1 (CET), +2 (CEST) between the last Sundays of March and October, 01:00 UTC.
 */
export function swedishUtcOffsetHours(utcMs: number): 1 | 2 {
  const d = new Date(utcMs);
  const year = d.getUTCFullYear();
  const lastSunday = (month: number): number => {
    const end = Date.UTC(year, month + 1, 0, 1); // last day of month, 01:00 UTC
    const dow = new Date(end).getUTCDay();
    return end - dow * 86_400_000;
  };
  const dstStart = lastSunday(2); // last Sunday of March, 01:00 UTC
  const dstEnd = lastSunday(9); // last Sunday of October, 01:00 UTC
  return utcMs >= dstStart && utcMs < dstEnd ? 2 : 1;
}
