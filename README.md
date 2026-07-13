# fabsolarbat — Home Battery Profitability Explorer

A fast, modern web tool for investigating whether installing a home battery is profitable, based on real hourly consumption, solar production and spot-price data. Runs entirely in the browser — upload your own data or explore the built-in Swedish 2024 sample dataset, tweak battery and tariff parameters, and see payback, ROI and hour-by-hour battery behavior instantly.

Built on the analysis work in [`larsenglund/notes/elpris batteri`](https://github.com/larsenglund/notes/tree/main/elpris%20batteri): a rolling day-ahead linear-programming optimization of battery charge/discharge against Nord Pool SE3 spot prices, validated over a full year of real household data.

## What it answers

- How much would a battery of size X kWh / Y kW save me per year with *my* consumption profile?
- What's the payback period, 10-year ROI and NPV — including battery degradation?
- How does it compare against just putting the money in an index fund?
- What does the battery actually *do* on a given day? (hourly charge/discharge schedule, state of charge, cost breakdown)
- How sensitive is the result to battery size, system cost, efficiency, tariffs and price volatility?

## Status

🏗️ **M1 shipped** — the simulation engine is ported to TypeScript (LP optimization on HiGHS WASM, hybrid solar forecasting, degradation, rolling day-ahead windows) and validated against the Python golden results: annual savings within 0.002%, worst per-day cost deviation ~1 öre, full-year run in ~1.5 s. Next: M2, the core UI.

The full development plan lives in [`docs/`](docs/):

| Document | Contents |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Product spec, features, milestones, testing & deployment plan |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack, simulation engine spec, data formats, upload pipeline |
| [docs/DESIGN.md](docs/DESIGN.md) | UI/UX design system — modern, sleek, fast |
| [docs/PRIOR_WORK.md](docs/PRIOR_WORK.md) | Research summary of the original Python analysis |

## Sample data

[`data/`](data/) contains a full year (2024) of real hourly data from a Swedish household in the SE3 price zone, used as the built-in demo dataset and as golden-file test fixtures:

- `merged_hourly_data.csv` — canonical merged format: `datetime, excess_solar_kwh, consumption_kwh, price_sek_per_kwh`
- `hourly_production_and_consumption.csv` — raw grid-operator export (Swedish locale, semicolon-separated) — upload-parser test fixture
- `hourly_power_price.csv` — raw ENTSO-E day-ahead price export (EUR/MWh) — upload-parser test fixture
- `eur_to_sek_2024.csv` — daily EUR→SEK exchange rates
- `annual_battery_results.csv` — golden results from the validated Python LP analysis, used to verify the TypeScript engine

## Development

Requires Node ≥ 22.

```sh
npm install
npm run dev        # dev server
npm run lint       # Biome (format + lint)
npm run test       # Vitest unit tests
npm run build      # typecheck + production build → dist/
npm run test:e2e   # Playwright smoke test against the production build
```

## Deployment

Every merge to `main` runs CI (lint → unit tests → build → e2e) and deploys `dist/` to GitHub Pages via `.github/workflows/ci.yml`.

One-time setup: in the repo settings, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The site then publishes at `https://larsenglund.github.io/fabsolarbat/`.

## Privacy

All computation happens client-side. Uploaded data never leaves the browser.
