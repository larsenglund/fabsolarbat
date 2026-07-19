# Development Plan

The what/when/how of building, testing and deploying the Home Battery Profitability Explorer. See [ARCHITECTURE.md](ARCHITECTURE.md) for the tech stack and engine spec, [DESIGN.md](DESIGN.md) for the UI system, [PRIOR_WORK.md](PRIOR_WORK.md) for the validated model being ported.

## Product goals

1. Let anyone answer *“would a home battery pay off for me?”* with their own data and honest, optimal-strategy math — not vendor napkin math.
2. Make parameter exploration instant and comparative (scenarios side-by-side, shareable links).
3. Keep user data private by running everything client-side.

**Non-goals (v1):** live price feeds / API integrations, battery *control* (this is analysis, not automation), accounts or server-side storage, export-revenue tax rebates (skattereduktion) beyond a simple per-kWh credit, effekttariff modeling (pluggable in v2).

## Feature set

### v1 (launch)

- Built-in 2024 SE3 sample dataset, loads instantly on “Explore sample data”
- Upload own data: canonical CSV, grid-operator export (Swedish locale), ENTSO-E prices + FX (fixed or daily rates, optional UTC shift); explicit format examples + downloadable templates; validation report; IndexedDB persistence with a remove control
- Full parameter panel (battery, tariffs, strategy, economics — see `ScenarioParams` in ARCHITECTURE.md)
- Simulation: LP-optimal rolling 35 h day-ahead strategy (HiGHS wasm in a worker); no-sell AND sell-at-spot market models (export earns spot + bonus; Sweden's abolished 60 öre skattereduktion deliberately excluded); 5 solar-forecast modes; degradation; executed-hours accounting for honest annual figures
- Results: hero stats (savings, payback, ROI/NPV vs index fund), monthly breakdown, 10-year degradation-aware projection, hourly explorer, day drill-down with flows/SoC/table
- Baseline pin (A/B): freeze the current result as a baseline, see deltas as parameters change; active scenario encoded in the URL for sharing
- Light/dark themes, responsive down to tablet; mobile gets results-first layout

### v2 candidates (explicitly out of v1 scope)

- House main-fuse grid-draw cap as an LP constraint
- Effekttariff (monthly peak-power fees) as a pluggable cost component
- Battery-size / system-cost sensitivity sweeps (heatmap: capacity × cost → payback)
- Consumption forecasting (today: perfect within window), EV charging profiles
- Live spot prices (elprisetjustnu.se API) for “what would the battery do tomorrow?”
- Generic column-mapping wizard for arbitrary CSV layouts (v1 ships auto-detection + explicit format examples instead)
- Multi-scenario tabs (more than A/B side-by-side)
- Localization (sv/en toggle; v1 is English with Swedish domain terms)

## Milestones

Each milestone ends deployed (preview from M1 on) and demoable.

### M0 — Scaffold & pipeline (small)
Vite + React + TS + Tailwind + Vitest + Playwright + Biome; GitHub Actions CI (lint, test, build) and Pages deploy of a placeholder page. Sample data committed (done). **Exit:** green CI, live URL.

### M1 — Engine parity with Python (the critical milestone)
Port the model: parser for the canonical CSV, cost model, battery model, LP window builder on HiGHS wasm (with the tiny grid-charge tie-break penalty from the Python model), rolling annual driver with SoC/cycle carry-over, finance math, solar forecast modes. Runs headless (no UI) in worker + Node.
**Exit criterion — golden-file validation:** full-year run on `data/merged_hourly_data.csv` reproduces `data/annual_battery_results.csv` (per-day `savings`, `optimized_cost`, flows, SoC) within tolerance (LP alternate-optima tolerated: daily cost within 0.5%, annual total within 0.1%). This gate is what makes every later UI number trustworthy.

### M2 — Core UI & drill-down
App shell, theming, parameter sidebar wired to worker, hero stats, cost/projection/monthly charts, assumptions bar, progress streaming, memoized results, hourly explorer (uPlot), day drill-down (flows + SoC + hourly table, prev/next, best/worst day shortcuts). Sample-data-only. **Exit:** full run < 5 s with responsive UI; day view matches Python `--day` output for 3 spot-checked days; Playwright happy path.

### M3 — Own data ✅
Upload page with explicit format contracts (example rows + downloadable templates per file type), the three concrete parsers (canonical merged CSV; Swedish grid-operator export with semicolons/decimal commas/BOM; ENTSO-E prices with EUR-MWh/SEK-kWh/öre units, fixed-or-daily FX, optional UTC→Swedish shift), merge with a validation report, local persistence (idb-keyval) + “remove my data”, short-dataset annualization labeling. The speculative generic column-mapping wizard was descoped in favor of auto-detection plus visible format examples — moved to v2. **Exit met:** the real fixtures import end-to-end in Playwright (the merged fixture reproduces the golden 3 967 kr/yr exactly); parser fixture + malformed tests pass.

### M4 — Sharing & polish
Baseline pin (A/B compare), URL state, empty states, keyboard/a11y pass, manual performance audit against the budgets, copy pass, README/user docs. **Exit:** launch checklist below.

## Testing strategy

| Layer | Tooling | What |
|---|---|---|
| Engine unit | Vitest | Cost model arithmetic; SoC continuity & efficiency; degradation curve; finance math (payback/NPV/ROI) against hand-computed cases; forecast methods |
| **Engine golden** | Vitest (Node, real wasm) | Full-year vs `annual_battery_results.csv` (M1 gate), plus 3 frozen day-level hourly breakdowns from the Python tool |
| Engine invariants | Vitest, seeded synthetic datasets (no extra deps) | optimized cost ≤ baseline cost; SoC always within bounds; energy conservation per hour; zero-capacity battery ⇒ zero savings |
| Parsers | Vitest fixtures | Real exports (committed), synthetic edge cases: BOM, decimal commas, DST duplicate/missing hour, gaps, wrong units, empty/huge files |
| UI | Playwright (small smoke suite) | Sample-data happy path; upload wizard end-to-end; URL round-trip. No screenshot diffing — visual baselines rot faster than they catch bugs |
| Perf | Manual, per milestone | Lighthouse + a timed engine run script against the ARCHITECTURE.md budgets; not a CI gate |

Numeric comparisons always use explicit tolerances and units in assertion messages.

## Deployment & operations

- **Hosting:** GitHub Pages from this repo, deployed by Actions on every merge to `main`; PRs get build+test (no preview envs needed for a static SPA — reviewers run locally, or add Pages previews via artifacts later).
- **Pipeline:** one workflow: `lint → typecheck → unit+golden tests → e2e smoke → build → (main only) deploy`. The suite is small enough to run whole every time — no path filtering to maintain.
- **Versioning:** simple — `main` is live; tag milestones. No changelog ceremony; git history suffices.
- **Monitoring:** none needed (static, no backend). Optional privacy-preserving Plausible later; default none.
- **Data hygiene:** repo ships only the owner-consented sample dataset; uploaded user data exists solely in the user's browser (IndexedDB) with an explicit delete control.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| TS/HiGHS results drift from validated Python model | M1 golden gate before any UI work; tolerances documented; keep Python outputs frozen in `data/` |
| LP alternate optima make per-day comparison flaky | Compare costs (unique at optimum) tightly, flows loosely; tie-break objective with tiny grid-charge penalty as in Python |
| HiGHS wasm size/perf on low-end devices | Lazy-load wasm; results cached by params hash; if full-year runs prove too slow in practice, add a coarse preview strategy *then* — not preemptively |
| Messy real-world uploads (locales, DST, units) | Real fixtures committed; validation report over silent fixes; generic mapping wizard as escape hatch |
| 8,760-point charts janky | uPlot is built for exactly this; verify in M2 before adding any downsampling |
| Scope creep (tariff models, live prices) | v2 list is explicit; cost model designed pluggable so v2 slots in without rework |

## Review backlog (from the M1 code-review workflow — verified findings, deferred)

Apply opportunistically with M2/M3 work; none block current functionality:

- **Engine/M2:** `retainHourly` option + per-day progress streaming for the day drill-down (simulate.ts); throw a readable error when no planning window fits the dataset; tsconfig project-references split so browser code stops seeing Node types
- **Parser/M3:** validate the header line (headerless CSVs currently lose row 1 silently)
- **Tests:** direct assertions on the execution-adjustment clamp branches (window.ts estimates path); skipped-day executed-hours accounting on a spliced synthetic dataset; fast SoC-carry (hourly[23]) test; finance payback with degradation + horizon boundary; solver retry-after-failure regression test; perfect-foresight SoC-bound invariants on real data
- **Docs:** replace ARCHITECTURE's ScenarioParams/HourRecord blocks with the real types from src/engine/types.ts; update the repository-layout tree (planned vs built); generate the 3 day-level golden fixtures the testing table promises, or drop the claim

## Launch checklist (end of M4)

- [ ] Golden tests green; timed engine run within budget
- [ ] Manual Lighthouse ≥ 95 (performance, accessibility) on landing + results, both themes
- [ ] Upload wizard handles all committed fixtures + malformed matrix
- [ ] URL sharing round-trips every parameter
- [ ] “Remove my data” verified to clear IndexedDB
- [ ] README rewritten for end users (screenshots, data-format docs, FAQ incl. “why do my results differ from vendor claims?”)
