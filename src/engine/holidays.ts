/**
 * Swedish public holidays ("röda dagar"), for tariffs that exclude them.
 * Dates are naive local days encoded as Date.UTC, like all engine timestamps.
 */

const DAY_MS = 86_400_000;

/** Easter Sunday of a Gregorian year (anonymous Gregorian algorithm), as Date.UTC ms. */
export function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

/** The Saturday within [first, first + 6] of a month (midsommardagen, alla helgons dag). */
function saturdayFrom(year: number, month0: number, firstDay: number): number {
  const t = Date.UTC(year, month0, firstDay);
  const dow = new Date(t).getUTCDay();
  return t + ((6 - dow + 7) % 7) * DAY_MS;
}

const cache = new Map<number, Set<number>>();

/** Day keys (floor(t / DAY_MS)) of every Swedish public holiday in a year. */
function holidayDays(year: number): Set<number> {
  let set = cache.get(year);
  if (set) return set;
  const easter = easterSunday(year);
  const dates = [
    Date.UTC(year, 0, 1), // nyårsdagen
    Date.UTC(year, 0, 6), // trettondedag jul
    easter - 2 * DAY_MS, // långfredagen
    easter, // påskdagen
    easter + DAY_MS, // annandag påsk
    Date.UTC(year, 4, 1), // första maj
    easter + 39 * DAY_MS, // Kristi himmelsfärdsdag
    easter + 49 * DAY_MS, // pingstdagen
    Date.UTC(year, 5, 6), // Sveriges nationaldag
    saturdayFrom(year, 5, 20), // midsommardagen
    saturdayFrom(year, 9, 31), // alla helgons dag (Sat Oct 31 – Nov 6)
    Date.UTC(year, 11, 25), // juldagen
    Date.UTC(year, 11, 26), // annandag jul
  ];
  set = new Set(dates.map((t) => Math.floor(t / DAY_MS)));
  cache.set(year, set);
  return set;
}

/** True if the naive timestamp falls on a Swedish public holiday. */
export function isSwedishPublicHoliday(t: number): boolean {
  return holidayDays(new Date(t).getUTCFullYear()).has(Math.floor(t / DAY_MS));
}
