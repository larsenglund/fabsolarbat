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
- Upload own data: canonical CSV, grid-operator export (Swedish locale), ENTSO-E prices + FX, generic column-mapping wizard; validation report; IndexedDB persistence
- Full parameter panel (battery, tariffs, strategy, economics — see `ScenarioParams` in ARCHITECTURE.md)
- Simulation: LP-optimal rolling 35 h day-ahead strategy (HiGHS wasm in a worker) + instant heuristic preview; no-sell and sell-at-spot variants; 5 solar-forecast modes; degradation
- Results: hero stats (savings, payback, ROI/NPV vs index fund), monthly breakdown, 10-year degradation-aware projection, hourly explorer, day drill-down with flows/SoC/table
- Scenario save/compare (≤4) + URL-encoded sharing
- Light/dark themes, responsive down to tablet; mobile gets results-first layout

### v2 candidates (explicitly out of v1 scope)

- Effekttariff (monthly peak-power fees) as a pluggable cost component
- Battery-size / system-cost sensitivity sweeps (heatmap: capacity × cost → payback)
- Consumption forecasting (today: perfect within window), EV charging profiles
- Live spot prices (elprisetjustnu.se API) for “what would the battery do tomorrow?”
- Localization (sv/en toggle; v1 is English with Swedish domain terms)

## Milestones

Each milestone ends deployed (preview from M1 on) and demoable.

### M0 — Scaffold & pipeline (small)
Vite + React + TS + Tailwind + Vitest + Playwright + ESLint/Prettier; GitHub Actions CI (lint, test, build) and Pages deploy of a placeholder page. Sample data committed (done). **Exit:** green CI, live URL.

### M1 — Engine parity with Python (the critical milestone)
Port the model: parsers for the canonical CSV, cost model, battery model, LP window builder on HiGHS wasm, rolling annual driver with SoC/cycle carry-over, finance math, solar forecast modes, heuristic strategy. Runs headless (no UI) in worker + Node.
**Exit criterion — golden-file validation:** full-year run on `data/merged_hourly_data.csv` reproduces `data/annual_battery_results.csv` (per-day `savings`, `optimized_cost`, flows, SoC) within tolerance (LP alternate-optima tolerated: daily cost within 0.5%, annual total within 0.1%). This gate is what makes every later UI number trustworthy.

### M2 — Core UI
App shell, theming, parameter sidebar wired to worker, hero stats, cost/projection/monthly charts, assumptions bar, progress streaming, memoized results. Sample-data-only. **Exit:** slider-to-preview < 100 ms; full run < 5 s; Playwright happy path.

### M3 — Explore & drill down
Hourly explorer (uPlot), day drill-down (flows + SoC + hourly table, prev/next, best/worst day shortcuts), price statistics panel. **Exit:** parity of day view with Python `--day` output for 3 spot-checked days.

### M4 — Own data
Upload wizard (3 steps), all three concrete parsers + generic mapping, validation/repair report, unit heuristics, FX handling, IndexedDB persistence + “remove my data”, short-dataset extrapolation labeling. **Exit:** fixtures `hourly_production_and_consumption.csv` and `hourly_power_price.csv` import end-to-end via the wizard in Playwright; malformed-file test matrix passes.

### M5 — Scenarios, sharing, polish
Scenario tabs + comparison views, URL state, empty states, keyboard/a11y pass, performance budget audit (Lighthouse ≥ 95 perf/a11y), copy pass, README/user docs. **Exit:** launch checklist below.

## Testing strategy

| Layer | Tooling | What |
|---|---|---|
| Engine unit | Vitest | Cost model arithmetic; SoC continuity & efficiency; degradation curve; finance math (payback/NPV/ROI) against hand-computed cases; forecast methods |
| **Engine golden** | Vitest (Node, real wasm) | Full-year vs `annual_battery_results.csv` (M1 gate), plus 3 frozen day-level hourly breakdowns from the Python tool |
| Engine property | Vitest + fast-check | Invariants on random datasets: optimized cost ≤ baseline cost; LP cost ≤ heuristic cost; SoC always within bounds; energy conservation per hour; zero-capacity battery ⇒ zero savings |
| Parsers | Vitest fixtures | Real exports (committed), synthetic edge cases: BOM, decimal commas, DST duplicate/missing hour, gaps, wrong units, empty/huge files |
| UI | Playwright | Sample-data happy path; upload wizard end-to-end; scenario compare; URL round-trip; both themes screenshot-diffed on key screens |
| Perf | CI Lighthouse + a timed engine benchmark | Budgets from ARCHITECTURE.md; benchmark fails CI if full-year run regresses > 2× |

Numeric comparisons always use explicit tolerances and units in assertion messages.

## Deployment & operations

- **Hosting:** GitHub Pages from this repo, deployed by Actions on every merge to `main`; PRs get build+test (no preview envs needed for a static SPA — reviewers run locally, or add Pages previews via artifacts later).
- **Pipeline:** `lint → typecheck → unit+golden tests → build → (main only) deploy`. Playwright on PRs touching `src/`.
- **Versioning:** simple — `main` is live; tag releases at milestones. CHANGELOG kept from M2.
- **Monitoring:** none needed (static, no backend). Optional privacy-preserving Plausible later; default none.
- **Data hygiene:** repo ships only the owner-consented sample dataset; uploaded user data exists solely in the user's browser (IndexedDB) with an explicit delete control.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| TS/HiGHS results drift from validated Python model | M1 golden gate before any UI work; tolerances documented; keep Python outputs frozen in `data/` |
| LP alternate optima make per-day comparison flaky | Compare costs (unique at optimum) tightly, flows loosely; tie-break objective with tiny grid-charge penalty as in Python |
| HiGHS wasm size/perf on low-end devices | Lazy-load wasm; heuristic preview keeps UI usable; benchmark in CI |
| Messy real-world uploads (locales, DST, units) | Real fixtures committed; validation report over silent fixes; generic mapping wizard as escape hatch |
| 8,760-point charts janky | uPlot for dense series; downsample (LTTB) when zoomed out |
| Scope creep (tariff models, live prices) | v2 list is explicit; cost model designed pluggable so v2 slots in without rework |

## Launch checklist (end of M5)

- [ ] Golden tests green; engine benchmark within budget
- [ ] Lighthouse ≥ 95 (performance, accessibility) on landing + results, both themes
- [ ] Upload wizard handles all committed fixtures + malformed matrix
- [ ] URL sharing round-trips every parameter
- [ ] “Remove my data” verified to clear IndexedDB
- [ ] README rewritten for end users (screenshots, data-format docs, FAQ incl. “why do my results differ from vendor claims?”)
