import type { Highs } from "./solver";

/**
 * One planning window's LP, mirroring the Python PuLP model exactly.
 *
 * Decision variables per hour t:
 *   s2b_t  solar → battery (kWh)
 *   g2b_t  grid → battery (kWh)
 *   b2h_t  battery → home (kWh)
 *   soc_t  state of charge after hour t (kWh), bounded [minSoc, maxSoc]
 *
 * minimize   Σ fullPrice_t · (consumption_t − b2h_t + g2b_t) + penalty · g2b_t
 * subject to soc_t = soc_{t−1} + η·(s2b_t + g2b_t) − b2h_t/η
 *            s2b_t ≤ solar_t          (planning solar, possibly estimated)
 *            s2b_t + g2b_t ≤ maxPower
 *            b2h_t ≤ maxPower
 *            b2h_t ≤ consumption_t
 *
 * The constant Σ fullPrice_t · consumption_t is dropped from the LP objective
 * (costs are recomputed in the accounting pass), leaving
 * Σ (fullPrice_t + penalty)·g2b_t − fullPrice_t·b2h_t.
 */
export interface LpWindowInput {
  fullPrice: number[];
  consumptionKwh: number[];
  planningSolarKwh: number[];
  initialSoc: number;
  minSoc: number;
  maxSoc: number;
  maxPowerKw: number;
  efficiency: number;
  gridChargePenalty: number;
}

export interface LpWindowPlan {
  solarToBattery: number[];
  gridToBattery: number[];
  batteryToHome: number[];
  soc: number[];
}

const f = (x: number): string => x.toFixed(10);
/** Signed term for LP objective syntax: "+ 1.23 x" or "- 1.23 x" (never "+ -1.23 x"). */
const term = (coef: number, name: string): string =>
  `${coef < 0 ? "-" : "+"} ${f(Math.abs(coef))} ${name}`;

export function buildLpText(input: LpWindowInput): string {
  const n = input.fullPrice.length;
  const eff = input.efficiency;
  const obj: string[] = [];
  const cons: string[] = [];
  const bounds: string[] = [];

  for (let t = 0; t < n; t++) {
    const price = input.fullPrice[t];
    obj.push(term(price + input.gridChargePenalty, `g2b_${t}`));
    obj.push(term(-price, `b2h_${t}`));

    const prev = t === 0 ? f(input.initialSoc) : "";
    if (t === 0) {
      cons.push(`soc0: soc_0 - ${f(eff)} s2b_0 - ${f(eff)} g2b_0 + ${f(1 / eff)} b2h_0 = ${prev}`);
    } else {
      cons.push(
        `soc${t}: soc_${t} - soc_${t - 1} - ${f(eff)} s2b_${t} - ${f(eff)} g2b_${t} + ${f(1 / eff)} b2h_${t} = 0`,
      );
    }
    cons.push(`rate${t}: s2b_${t} + g2b_${t} <= ${f(input.maxPowerKw)}`);

    bounds.push(`0 <= s2b_${t} <= ${f(Math.max(0, input.planningSolarKwh[t]))}`);
    bounds.push(
      `0 <= b2h_${t} <= ${f(Math.max(0, Math.min(input.maxPowerKw, input.consumptionKwh[t])))}`,
    );
    bounds.push(`${f(input.minSoc)} <= soc_${t} <= ${f(input.maxSoc)}`);
  }

  return `Minimize\n obj: ${obj.join(" ")}\nSubject To\n ${cons.join("\n ")}\nBounds\n ${bounds.join("\n ")}\nEnd\n`;
}

export function solveWindow(highs: Highs, input: LpWindowInput): LpWindowPlan {
  const n = input.fullPrice.length;
  const solution = highs.solve(buildLpText(input));
  if (solution.Status !== "Optimal") {
    throw new Error(`LP solve failed with status: ${solution.Status}`);
  }
  const value = (name: string): number => {
    const col = solution.Columns[name];
    return col ? col.Primal : 0;
  };
  const plan: LpWindowPlan = {
    solarToBattery: [],
    gridToBattery: [],
    batteryToHome: [],
    soc: [],
  };
  for (let t = 0; t < n; t++) {
    plan.solarToBattery.push(value(`s2b_${t}`));
    plan.gridToBattery.push(value(`g2b_${t}`));
    plan.batteryToHome.push(value(`b2h_${t}`));
    plan.soc.push(value(`soc_${t}`));
  }
  return plan;
}
