import { DEFAULT_FINANCE, type FinanceParams } from "./engine/finance";
import {
  DEFAULT_PARAMS,
  type EngineParams,
  type MarketModel,
  type SolarForecastMethod,
} from "./engine/types";

/**
 * Scenario ⇄ URL query-string encoding. Links share *parameters*, never data:
 * only values that differ from the defaults are emitted, so a default scenario
 * has an empty query string. Unknown keys and out-of-range values are ignored
 * on decode — a mangled shared link degrades to defaults instead of erroring.
 */

export interface Scenario {
  params: EngineParams;
  finance: FinanceParams;
}

interface NumField {
  key: string;
  get: (p: EngineParams, f: FinanceParams) => number;
  set: (p: EngineParams, f: FinanceParams, v: number) => void;
  /** Sanity bounds (wider than the UI sliders); outside ⇒ value ignored. */
  min: number;
  max: number;
}

const NUM_FIELDS: NumField[] = [
  {
    key: "cap",
    get: (p) => p.battery.usableCapacityKwh,
    set: (p, _f, v) => {
      p.battery.usableCapacityKwh = v;
    },
    min: 0.1,
    max: 1000,
  },
  {
    key: "pow",
    get: (p) => p.battery.maxPowerKw,
    set: (p, _f, v) => {
      p.battery.maxPowerKw = v;
    },
    min: 0.1,
    max: 1000,
  },
  {
    key: "eff",
    get: (p) => p.battery.acEfficiency,
    set: (p, _f, v) => {
      p.battery.acEfficiency = v;
    },
    min: 0.5,
    max: 1,
  },
  {
    key: "soc",
    get: (p) => p.battery.maxChargePercent,
    set: (p, _f, v) => {
      p.battery.maxChargePercent = v;
    },
    min: 10,
    max: 100,
  },
  {
    key: "dod",
    get: (p) => p.battery.depthOfDischargePercent,
    set: (p, _f, v) => {
      p.battery.depthOfDischargePercent = v;
    },
    min: 10,
    max: 100,
  },
  {
    key: "cyc",
    get: (p) => p.battery.cyclesToEol,
    set: (p, _f, v) => {
      p.battery.cyclesToEol = v;
    },
    min: 100,
    max: 100_000,
  },
  {
    key: "eol",
    get: (p) => p.battery.eolCapacityPercent,
    set: (p, _f, v) => {
      p.battery.eolCapacityPercent = v;
    },
    min: 10,
    max: 100,
  },
  {
    key: "vat",
    get: (p) => p.tariff.vatMultiplier,
    set: (p, _f, v) => {
      p.tariff.vatMultiplier = v;
    },
    min: 1,
    max: 2,
  },
  {
    key: "fee",
    get: (p) => p.tariff.transferFeeSekPerKwh,
    set: (p, _f, v) => {
      p.tariff.transferFeeSekPerKwh = v;
    },
    min: 0,
    max: 10,
  },
  {
    key: "mkp",
    get: (p) => p.tariff.fixedMarkupSekPerKwh,
    set: (p, _f, v) => {
      p.tariff.fixedMarkupSekPerKwh = v;
    },
    min: 0,
    max: 10,
  },
  {
    key: "bon",
    get: (p) => p.tariff.sellBonusSekPerKwh,
    set: (p, _f, v) => {
      p.tariff.sellBonusSekPerKwh = v;
    },
    min: 0,
    max: 10,
  },
  {
    key: "ph",
    get: (p) => p.strategy.planningHour,
    set: (p, _f, v) => {
      p.strategy.planningHour = v;
    },
    min: 0,
    max: 23,
  },
  {
    key: "wh",
    get: (p) => p.strategy.windowHours,
    set: (p, _f, v) => {
      p.strategy.windowHours = v;
    },
    min: 24,
    max: 48,
  },
  {
    key: "pen",
    get: (p) => p.strategy.gridChargePenaltySekPerKwh,
    set: (p, _f, v) => {
      p.strategy.gridChargePenaltySekPerKwh = v;
    },
    min: 0,
    max: 1,
  },
  {
    key: "cost",
    get: (_p, f) => f.systemCostSek,
    set: (_p, f, v) => {
      f.systemCostSek = v;
    },
    min: 0,
    max: 10_000_000,
  },
  {
    key: "yrs",
    get: (_p, f) => f.horizonYears,
    set: (_p, f, v) => {
      f.horizonYears = v;
    },
    min: 1,
    max: 50,
  },
  {
    key: "dr",
    get: (_p, f) => f.discountRate,
    set: (_p, f, v) => {
      f.discountRate = v;
    },
    min: 0,
    max: 1,
  },
  {
    key: "alt",
    get: (_p, f) => f.alternativeReturnRate,
    set: (_p, f, v) => {
      f.alternativeReturnRate = v;
    },
    min: 0,
    max: 1,
  },
];

const MODEL_CODES: Record<string, MarketModel> = {
  nosell: "no-sell",
  sell: "sell-at-spot",
};
const MODEL_TO_CODE: Record<MarketModel, string> = {
  "no-sell": "nosell",
  "sell-at-spot": "sell",
};

/** null (plan on actual future solar) encodes as "actual". */
const FORECAST_CODES = new Set([
  "perfect",
  "simple",
  "weighted",
  "hybrid",
  "persistence",
  "actual",
]);

/** Trim float noise from UI step arithmetic without losing real precision. */
function fmt(v: number): string {
  return String(Math.round(v * 1e6) / 1e6);
}

/**
 * Encode a scenario as a query string (no leading "?"). Only non-default
 * values are included; `includeSampleFlag` adds `d=sample` so the link opens
 * straight into the sample-data analysis.
 */
export function encodeScenario(
  params: EngineParams,
  finance: FinanceParams,
  includeSampleFlag = false,
): string {
  const q = new URLSearchParams();
  if (includeSampleFlag) q.set("d", "sample");
  if (params.strategy.model !== DEFAULT_PARAMS.strategy.model) {
    q.set("mdl", MODEL_TO_CODE[params.strategy.model]);
  }
  const fc = params.strategy.solarForecast ?? "actual";
  if (fc !== DEFAULT_PARAMS.strategy.solarForecast) q.set("fc", fc);
  for (const f of NUM_FIELDS) {
    const v = f.get(params, finance);
    if (v !== f.get(DEFAULT_PARAMS, DEFAULT_FINANCE)) q.set(f.key, fmt(v));
  }
  return q.toString();
}

export interface DecodedScenario extends Scenario {
  /** True if the query string contained at least one recognized scenario key. */
  hasScenario: boolean;
  /** True if the link asks to open the built-in sample dataset. */
  openSample: boolean;
}

/** Decode a query string (with or without leading "?") over the defaults. */
export function decodeScenario(search: string): DecodedScenario {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const params = structuredClone(DEFAULT_PARAMS);
  const finance = { ...DEFAULT_FINANCE };
  let hasScenario = false;

  const mdl = q.get("mdl");
  if (mdl && MODEL_CODES[mdl]) {
    params.strategy.model = MODEL_CODES[mdl];
    hasScenario = true;
  }
  const fc = q.get("fc");
  if (fc && FORECAST_CODES.has(fc)) {
    params.strategy.solarForecast = fc === "actual" ? null : (fc as SolarForecastMethod);
    hasScenario = true;
  }
  for (const f of NUM_FIELDS) {
    const raw = q.get(f.key);
    if (raw === null) continue;
    const v = Number(raw);
    if (Number.isFinite(v) && v >= f.min && v <= f.max) {
      f.set(params, finance, v);
      hasScenario = true;
    }
  }

  return { params, finance, hasScenario, openSample: q.get("d") === "sample" };
}
