const NBSP = " ";
const MINUS = "−";

/** Whole SEK with non-breaking thousands separators, e.g. 8334.4 → "8 334 kr". */
export function formatSek(value: number): string {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${rounded < 0 ? MINUS : ""}${digits}${NBSP}kr`;
}

/** Swedish-style percent with comma decimal, e.g. 21.34 → "21,3 %". */
export function formatPercent(value: number, decimals = 1): string {
  const fixed = Math.abs(value).toFixed(decimals);
  // Sign follows the ROUNDED magnitude so -0.04 renders "0,0 %", not "−0,0 %".
  const isNegative = value < 0 && Number(fixed) !== 0;
  return `${isNegative ? MINUS : ""}${fixed.replace(".", ",")}${NBSP}%`;
}
