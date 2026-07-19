import type { AnnualResult } from "../engine/types";

/** Indices of the days with the highest and lowest executed savings. */
export function bestWorstDays(result: AnnualResult): { best: number; worst: number } {
  let best = 0;
  let worst = 0;
  result.days.forEach((d, i) => {
    if (d.executedSavings > result.days[best].executedSavings) best = i;
    if (d.executedSavings < result.days[worst].executedSavings) worst = i;
  });
  return { best, worst };
}
