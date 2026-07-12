# Architecture & Tech Stack

## Guiding decision: 100% client-side

The whole simulation — data parsing, LP optimization, statistics — runs in the browser. No backend.

**Why:**

- **Privacy.** Users upload their household energy data; it never leaves their machine. This removes every consent/GDPR concern and makes the tool trustworthy by construction.
- **Cost & operations.** Free static hosting (GitHub Pages), zero servers to maintain, no scaling concerns.
- **Speed.** The prior Python work solves each daily LP in <0.1 s. A year is 365 LPs of ~140 variables each — HiGHS compiled to WASM solves this class of problem in milliseconds per day; a full-year run completes in a few seconds, off the main thread, with streaming progress.
- **Shareability.** Scenario parameters encode into the URL; anyone can reproduce a result with a link (their data stays local — links share *parameters*, not data).

## Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Build | **Vite** | Fast dev server and production builds, first-class TS/worker support |
| Language | **TypeScript** (strict) | The engine is numeric and fiddly; types catch unit errors (kWh vs kW vs SEK) |
| UI framework | **React 19** | Ecosystem, familiarity, fine for a dashboard SPA |
| Styling | **Tailwind CSS v4** + design tokens from [DESIGN.md](DESIGN.md) | Fast iteration, consistent system, trivial dark mode |
| State | **Zustand** | Small, no boilerplate; one store for dataset, one for scenario params, one for results |
| LP solver | **`highs` (HiGHS → WASM)** | Same problem class the Python CBC solver handled; state-of-the-art, MIT-licensed, ~1 MB wasm loaded lazily inside the worker |
| Simulation host | **Web Worker** (Comlink) | Keeps 365 LP solves off the main thread; posts per-day progress for a live progress UI |
| CSV parsing | **Papa Parse** | Streaming, handles quoting/BOM; we add locale sniffing (`;` + decimal comma) on top |
| Charts | **Recharts** for aggregates (monthly bars, payback curves) + **uPlot** for dense hourly series (8,760-point timelines, day drill-down) | Recharts is ergonomic; uPlot renders 10k+ points at 60 fps where Recharts chokes |
| Dates | **date-fns** (+ `@date-fns/tz`) | Hourly data with DST transitions (8,783 ≠ 8,760 hours in the source data — CET/CEST) |
| Unit tests | **Vitest** | Engine golden-file tests, parser fixtures |
| E2E tests | **Playwright** | Upload flow, parameter changes, chart rendering |
| Lint/format | **ESLint + Prettier** | CI-enforced |
| CI/CD | **GitHub Actions → GitHub Pages** | Test + build on PR; deploy on merge to `main` |

## Repository layout

```
fabsolarbat/
├── data/                    # sample dataset + parser fixtures + golden results
├── docs/                    # this plan
├── public/
├── src/
│   ├── engine/              # pure TS, no DOM — the simulation core
│   │   ├── types.ts         # HourRecord, ScenarioParams, DayResult, AnnualResult…
│   │   ├── costModel.ts     # VAT, transfer fee, sell-price models
│   │   ├── battery.ts       # SoC bounds, degradation, power limits
│   │   ├── lp.ts            # LP problem builder for one 35 h window (HiGHS)
│   │   ├── heuristic.ts     # fast greedy strategy (instant preview + LP sanity bound)
│   │   ├── solarForecast.ts # perfect / simple / weighted / hybrid / persistence
│   │   ├── simulate.ts      # rolling-window annual driver, cycle & SoC carry-over
│   │   └── finance.ts       # payback, ROI, NPV, index-fund comparison, 10 yr projection
│   ├── workers/
│   │   └── simulation.worker.ts
│   ├── data/
│   │   ├── parsers/         # merged CSV, grid-operator export, ENTSO-E prices, FX
│   │   ├── mapping.ts       # column-mapping model for the upload wizard
│   │   └── validate.ts      # gap detection, DST handling, unit sanity checks
│   ├── store/
│   ├── components/          # UI (see DESIGN.md)
│   ├── pages/
│   └── urlState.ts          # scenario params ⇄ URL query encoding
├── tests/
│   ├── golden/              # comparisons against data/annual_battery_results.csv
│   └── e2e/
└── .github/workflows/
```

## Simulation engine specification

A faithful port of the validated Python model (see [PRIOR_WORK.md](PRIOR_WORK.md)), generalized behind parameters.

### Input dataset (canonical internal form)

```ts
interface HourRecord {
  datetime: Date;          // hour start, local time
  consumptionKwh: number;  // consumption from grid (baseline, ≥ 0)
  excessSolarKwh: number;  // solar exported to grid in baseline (≥ 0)
  priceSekPerKwh: number;  // spot price, currency-converted, ex-VAT
}
```

### Scenario parameters (all user-adjustable)

```ts
interface ScenarioParams {
  battery: {
    usableCapacityKwh: number;      // default 13.82
    maxPowerKw: number;             // default 7.68 (charge = discharge)
    acEfficiency: number;           // default 0.95 per direction
    maxChargePercent: number;       // default 95
    depthOfDischargePercent: number;// default 90
    cyclesToEol: number;            // default 6000
    eolCapacityPercent: number;     // default 70
    systemCostSek: number;          // default 75000
  };
  house: { maxGridKw: number };     // default √3·20A·400V ≈ 13.9
  tariff: {
    vatMultiplier: number;          // default 1.25 (applied to spot)
    transferFeeSekPerKwh: number;   // default 0.685 (incl. VAT)
    fixedMarkupSekPerKwh: number;   // default 0 (retailer påslag)
    // v2: time-of-use transfer fees, effekttariff (peak-power fee per month)
  };
  strategy: {
    model: 'no-sell' | 'sell-at-spot';   // default 'no-sell'
    planningHour: number;                 // default 13 (day-ahead publication)
    windowHours: number;                  // default 35
    solarForecast: 'perfect' | 'simple' | 'weighted' | 'hybrid' | 'persistence';
    allowGridCharging: boolean;           // default true
  };
  finance: {
    horizonYears: number;           // default 10
    discountRate: number;           // default 0.03
    alternativeReturnRate: number;  // default 0.08 (index fund)
    electricityPriceTrend: number;  // default 0 (%/yr, sensitivity lever)
  };
}
```

### Daily LP (one 35-hour window)

Variables per hour `t`: `s2b[t]`, `g2b[t]`, `b2h[t]` ≥ 0; `soc[t]` ∈ [capacity·(1−DoD%), capacity·maxCharge%·capFactor].

Objective: minimize Σ `(g2h[t] + g2b[t]) · fullPrice[t]` (− Σ `export[t] · sellPrice[t]` in sell model), where `g2h[t] = consumption[t] − b2h[t]` and `fullPrice = spot·VAT + transfer + markup`.

Constraints (per hour):

1. SoC continuity: `soc[t] = soc[t−1] + (s2b[t] + g2b[t])·η − b2h[t]/η`
2. `s2b[t] ≤ excessSolar[t]` (forecasted value during planning; actuals during accounting)
3. `s2b[t] + g2b[t] ≤ maxPowerKw` ; `b2h[t] ≤ maxPowerKw`
4. `b2h[t] ≤ consumption[t]` (battery only offsets load; no export from battery in v1)
5. `g2h[t] + g2b[t] ≤ house.maxGridKw`
6. Terminal condition: `soc[T] ≥ initialSoc` is **not** imposed (matches Python); instead SoC at hour 24 carries to next day's window, which naturally values stored energy.

Degradation: effective capacity = `usableCapacity · (1 − (1 − eol%) · cycles/cyclesToEol)`, cycles accumulated as `Σ b2h / usableCapacity`, linear continuation past EOL (floor 10%) — identical to the Python projection.

### Execution model

```
UI thread                     Worker
────────────                  ──────────────────────────────
params/dataset change  ──►    debounce → run heuristic (ms)  ──► instant preview results
                              then run LP year (~seconds)    ──► per-day progress events
                                                             ──► final AnnualResult replaces preview
```

The heuristic (greedy threshold arbitrage, ported from `battery_analysis_10kWh_SEK.py`) gives sub-100 ms feedback on every slider move; the LP result streams in and replaces it. Results are memoized by hash(params + dataset).

## Data upload pipeline

**Formats supported at launch:**

1. **Canonical merged CSV** — `datetime, excess_solar_kwh, consumption_kwh, price_sek_per_kwh` (power users, documented schema).
2. **Grid-operator consumption/production export** — semicolon-separated, Swedish decimal commas, BOM, quoted fields (fixture: `data/hourly_production_and_consumption.csv`). Consumption-only exports also accepted (solar treated as 0).
3. **ENTSO-E day-ahead price export** — EUR/MWh with hour-range timestamps (fixture: `data/hourly_power_price.csv`), plus FX: fixed rate or uploaded daily-rates CSV.
4. **Anything else** → generic **column-mapping wizard**: Papa Parse sniffs delimiter/locale, user maps columns to roles (timestamp, consumption, production, price), picks units (kWh, W avg, EUR/MWh, SEK/kWh, öre/kWh).

**Validation & repair** (surfaced in a pre-flight report, never silent):

- Timestamp parsing incl. DST (duplicated/missing hour), gap detection, coverage summary
- Negative/absurd values flagged; unit sanity heuristics (e.g. consumption mean ≫ 100 ⇒ probably W not kWh — suggest, don't auto-fix)
- Price series and energy series may have different date ranges → intersect, report dropped hours
- Datasets shorter than a year are allowed; annualized figures are extrapolated and clearly labeled

**Persistence:** parsed datasets cached in IndexedDB (local only) so a reload doesn't require re-upload. Explicit "remove my data" control.

## Deployment

- **GitHub Pages** via Actions: `test → build → deploy` on push to `main`; PR runs test+build only.
- Static output, aggressive asset hashing; HiGHS wasm lazy-loaded and cached.
- No analytics, or privacy-preserving counts only (e.g. Plausible) — decision deferred; default is none.

## Performance budget

| Metric | Target |
|---|---|
| First contentful paint (Pages, cold) | < 1.5 s |
| Bundle (initial, gz) | < 250 kB (wasm + uPlot lazy) |
| Heuristic preview after slider change | < 100 ms |
| Full-year LP run (M2-class laptop) | < 5 s, with progress bar |
| Hourly chart pan/zoom (8,760 pts) | 60 fps |
