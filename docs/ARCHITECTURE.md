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
| State | **Zustand** (M2) | Small, no boilerplate; one store for dataset, one for scenario params, one for results |
| LP solver | **`highs` (HiGHS → WASM)** | Same problem class the Python CBC solver handled; state-of-the-art, MIT-licensed, wasm loaded lazily inside the worker. (Pure-JS solvers like jsLPSolver were considered — no wasm asset to serve — but are unmaintained and numerically weaker; parity with the Python LP is the whole point.) |
| Simulation host | **Web Worker**, plain typed `postMessage` | Keeps 365 LP solves off the main thread. One worker, two message types (run, progress) — no RPC library needed |
| CSV parsing | **Papa Parse** (M3 upload wizard) | Streaming, handles quoting/BOM; we add locale sniffing (`;` + decimal comma) on top. The canonical merged-CSV parser (src/data/parsers/mergedCsv.ts) is a small hand-rolled fixed-format parser and stays that way |
| Charts | **uPlot** (M2) for time series (hourly explorer, projections); aggregate charts (12 monthly bars, day-flow stacks) as small hand-rolled SVG components | One tiny (~45 kB) chart dependency that renders 8,760 points at 60 fps; a 12-bar chart doesn't need a library |
| Dates | none — small fixed-format timestamp parser | Input formats are known and timestamps are naive local hours; DST duplicates/gaps are detected in validation, not resolved by a tz library |
| Persistence | **idb-keyval** (M3) | Two-function IndexedDB wrapper for caching the parsed dataset locally |
| Unit tests | **Vitest** | Engine golden-file tests, invariant tests on seeded synthetic data, parser fixtures |
| E2E tests | **Playwright** (small smoke suite) | Sample-data happy path, upload wizard, URL round-trip — nothing screenshot-based |
| Lint/format | **Biome** | One fast tool instead of ESLint + Prettier + plugin config |
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
│   │   ├── costModel.ts     # VAT, transfer fee, markup (sell-price models: v2)
│   │   ├── battery.ts       # SoC bounds, degradation, power limits
│   │   ├── lp.ts            # LP problem builder for one 35 h window (HiGHS)
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
    maxChargePercent: number;       // default 100 (golden run); 95 typical vendor setting
    depthOfDischargePercent: number;// default 90
    cyclesToEol: number;            // default 6000
    eolCapacityPercent: number;     // default 70
    systemCostSek: number;          // default 75000
  };
  house: { maxGridKw: number };     // default √3·20A·400V ≈ 13.9 — v2: not yet an LP constraint
  tariff: {
    vatMultiplier: number;          // default 1.25 (applied to spot)
    transferFeeSekPerKwh: number;   // default 0.685 (incl. VAT)
    fixedMarkupSekPerKwh: number;   // default 0 (retailer påslag)
    // v2: time-of-use transfer fees, effekttariff (peak-power fee per month)
  };
  strategy: {
    model: 'no-sell';                    // v2: 'sell-at-spot' with export valuation (see PLAN.md)
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

Variables per hour `t`: `s2b[t]`, `g2b[t]`, `b2h[t]` ≥ 0; `soc[t]` ∈ [effCap·(1−DoD%), effCap·maxCharge%] with effCap = capacity·capFactor (degradation).

Objective: minimize Σ `(g2h[t] + g2b[t]) · fullPrice[t]` (a v2 sell model would subtract Σ `export[t] · sellPrice[t]`), where `g2h[t] = consumption[t] − b2h[t]` and `fullPrice = spot·VAT + transfer + markup`.

Constraints (per hour):

1. SoC continuity: `soc[t] = soc[t−1] + (s2b[t] + g2b[t])·η − b2h[t]/η`
2. `s2b[t] ≤ excessSolar[t]` (forecasted value during planning; actuals during accounting)
3. `s2b[t] + g2b[t] ≤ maxPowerKw` ; `b2h[t] ≤ maxPowerKw`
4. `b2h[t] ≤ consumption[t]` (battery only offsets load; no export from battery in v1)
5. SoC bounds: `minSoc ≤ soc[t] ≤ max(maxSoc, initialSoc)` — the ceiling admits charge carried from yesterday when degradation has shrunk today's maxSoc below it (the Python original was silently infeasible here)
6. Terminal condition: `soc[T] ≥ initialSoc` is **not** imposed (matches Python); instead SoC at hour 24 carries to next day's window, which naturally values stored energy.

NOT modeled (matching the Python original): a house main-fuse grid-draw cap — the optimizer can schedule grid draw above a real connection's limit in the cheapest hours; a `house.maxGridKw` constraint is a v2 candidate.

**Accounting: windowed vs. executed.** Consecutive windows overlap by 11 h, and only a window's first 24 h are actually executed (the tail is re-planned the next day). Per-day results therefore carry two sets of figures: window-summed metrics (Python-parity, inflated ~1.5× when summed annually — used only by the golden tests) and `executed*` metrics that count every simulated hour exactly once — **all user-facing aggregates use the executed figures**, including cycles fed to the finance projection.

Degradation: effective capacity = `usableCapacity · (1 − (1 − eol%) · cycles/cyclesToEol)`, cycles accumulated as `Σ b2h / usableCapacity`, linear continuation past EOL (floor 10%) — identical to the Python projection.

### Execution model

```
UI thread                     Worker
────────────                  ──────────────────────────────
params/dataset change  ──►    debounce (~300 ms) → LP year   ──► per-day progress events
                                                             ──► AnnualResult (cached by hash)
```

One engine, one source of truth. While a run is in flight the previous results stay visible but dimmed, with a slim progress bar; results are memoized by hash(params + dataset) so revisiting a setting is instant. If full-year runs ever prove too slow on low-end devices, the fallback is a coarse preview strategy — deliberately not built until proven necessary.

## Data upload pipeline

**Formats supported at launch:**

1. **Canonical merged CSV** — `datetime, excess_solar_kwh, consumption_kwh, price_sek_per_kwh` (power users, documented schema).
2. **Grid-operator consumption/production export** — semicolon-separated, Swedish decimal commas, BOM, quoted fields (fixture: `data/hourly_production_and_consumption.csv`). Consumption-only exports also accepted (solar treated as 0).
3. **ENTSO-E day-ahead price export** — EUR/MWh with hour-range timestamps (fixture: `data/hourly_power_price.csv`), plus FX: fixed rate or uploaded daily-rates CSV.
4. **Anything else** → generic **column-mapping wizard**: Papa Parse sniffs delimiter/locale, user maps columns to roles (timestamp, consumption, production, price), picks units (kWh, W avg, EUR/MWh, SEK/kWh, öre/kWh).

**Validation & repair** (surfaced in a pre-flight report, never silent):

- Timestamp parsing (small fixed-format parser) incl. DST duplicated/missing hour, gap detection, coverage summary
- Negative/absurd values flagged; unit sanity heuristics (e.g. consumption mean ≫ 100 ⇒ probably W not kWh — suggest, don't auto-fix)
- Price series and energy series may have different date ranges → intersect, report dropped hours
- Datasets shorter than a year are allowed; annualized figures are extrapolated and clearly labeled

**Persistence:** parsed dataset cached locally via idb-keyval so a reload doesn't require re-upload. Explicit "remove my data" control.

## Deployment

- **GitHub Pages** via Actions: `test → build → deploy` on push to `main`; PR runs test+build only.
- Static output, aggressive asset hashing; HiGHS wasm lazy-loaded and cached.
- No analytics, or privacy-preserving counts only (e.g. Plausible) — decision deferred; default is none.

## Performance budget

| Metric | Target |
|---|---|
| First contentful paint (Pages, cold) | < 1.5 s |
| Bundle (initial, gz) | < 250 kB (wasm + uPlot lazy) |
| Full-year LP run (M2-class laptop) | < 5 s, with progress bar; UI stays interactive throughout |
| Hourly chart pan/zoom (8,760 pts) | 60 fps |

Budgets are checked manually (Lighthouse + a timed engine run script) before milestones — not enforced as CI gates, which tend to be flaky and become maintenance work themselves.
