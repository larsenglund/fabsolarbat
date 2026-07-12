# Prior Work — Research Summary

Summary of the analysis in [`larsenglund/notes/elpris batteri`](https://github.com/larsenglund/notes/tree/main/elpris%20batteri), which this project turns into an interactive web tool. Everything below is validated, working Python code and real data — the web tool's simulation engine is a faithful port of this model.

## The question

Is a residential battery economically viable for a Swedish house with solar panels, given hourly Nord Pool spot prices? Analyzed with a full year (2024, 8,783 hours) of real data from a household in the SE3 price zone.

## Data inputs

| File | Contents | Format quirks |
|---|---|---|
| `hourly_production_and_consumption.csv` | Grid-operator export: excess solar to grid (kWh) + consumption from grid (kWh) per hour | Semicolon-separated, Swedish decimal commas, quoted fields, BOM |
| `hourly_power_price.csv` | ENTSO-E day-ahead prices for SE3 (EUR/MWh) | Hour-range timestamps (`01/01/2024 00:00:00 - 01/01/2024 01:00:00`) |
| `eur_to_sek_2024.csv` | Daily EUR→SEK rates | Used to convert prices to SEK |
| `merged_hourly_data.csv` | Canonical merged dataset: `datetime, excess_solar_kwh, consumption_kwh, price_sek_per_kwh` | Produced by `merge_hourly_data.py` |

**Important data semantics** (from `initial_prompt.md`):

- The house's *total* solar production is unknown — only *excess* solar exported to grid and consumption *from grid* are metered. Solar consumed directly in the house is invisible in the data.
- An hour can have both grid consumption and excess solar (e.g. partial cloud cover within the hour).
- Excess solar can charge the battery or be exported; export revenue is ignored (no sell-price data) in the primary "no-sell" model.

## Cost model

```
cost per purchased kWh = (spot price × 1.25) + 0.685 SEK
                          └ 25% VAT           └ grid transfer fee (incl. VAT)
```

## Battery model (reference system: Ai-HB 150A 15.36 kWh)

| Parameter | Value |
|---|---|
| Usable capacity | 13.82 kWh |
| Max charge/discharge power | 7,680 W |
| AC efficiency (each direction) | 95% (≈90.3% round-trip) |
| Depth of discharge | 90% (floor at 10% SoC) |
| Max charge | 95–100% |
| Degradation | linear, 6,000 cycles → 70% of initial capacity; cycles counted as discharged kWh / capacity |
| House main fuse limit | 20 A × 400 V × √3 ≈ 13.9 kW grid draw cap |

## Optimization strategy (the key insight of the prior work)

Nord Pool publishes next-day hourly prices at ~13:00 CET. So each day at 13:00 the household knows prices for a **35-hour window** (13:00 today → 24:00 tomorrow). The simulation:

1. At each day's 13:00, extract the 35-hour window of (consumption, excess solar, price).
2. Solve a **linear program** (PuLP + CBC in Python) minimizing total purchase cost, with decision variables per hour: solar→battery, grid→battery, battery→home, SoC.
3. Constraints: SoC bounds (DoD floor, max-charge ceiling, degraded capacity), charge/discharge power limits, solar→battery ≤ available excess solar, battery→home ≤ consumption, SoC continuity with charge/discharge efficiency.
4. Carry the SoC at hour 24 (next day 13:00) into the next day's window; accumulate cycles for degradation.
5. Repeat for all 365 days; compare against the no-battery baseline cost.

Each daily LP has ~140 variables and solves in <0.1 s. The LP is provably optimal, handles edge cases (empty battery at window start with expensive hours first) automatically, and beat the earlier heuristic strategies (charge-below-daily-average, threshold rules in `battery_analysis*.py`) by a wide margin.

### Solar forecasting modes

Perfect foreknowledge of solar is unrealistic, so `annual_battery_analysis.py` supports estimation methods used during planning (actuals still used during accounting):

- `perfect` — actual future values (upper-bound baseline)
- `simple` — 3-day rolling average per hour-of-day
- `weighted` — recent days weighted more
- `hybrid` — today's morning pattern + 3-day average (default)
- `persistence` — last known value continues

### Model variants explored

- **No-sell model** (primary): excess solar not used for charging is wasted; only purchases are costed. Most defensible given no sell-price data.
- **Grid-selling model**: excess solar sold at spot; makes the *baseline* cheaper, so the battery's incremental savings look *smaller* (counter-intuitive result documented in `Three_Scenario_Analysis_Results.md`).
- Battery sizes 10 / 13.82 / 15 kWh, various system costs (30–80 kSEK).

## Reported outputs (what users of the tool will expect)

- Annual cost with vs. without battery, total savings (SEK and %)
- Monthly breakdown (winter arbitrage vs. summer solar-dominant patterns)
- Battery usage: kWh charged from solar vs. grid, discharged, total cycles, average capacity factor
- 10-year projection with degradation; payback period, 10-year ROI, NPV (3% discount), comparison vs. index fund at 8%/yr
- Price statistics: average/max daily spread, best/worst savings days
- Per-day hourly breakdown table: `Home, Solar, Price, SoC, S→B, G→B, B→H, G→H, Cost`
- Solar-estimation accuracy metrics when forecasting is enabled

## Headline results from the prior analysis (2024 data, 13.82 kWh battery)

Results varied substantially by model refinement — an object lesson in why interactive parameter exploration matters:

- Naive heuristic, 10 kWh, sell-at-spot baseline: ~679–900 SEK/yr → 55–74 yr payback (not viable)
- No-sell model + transfer costs, heuristic: ~1,227–2,730 SEK/yr
- **LP-optimal, 35 h window, no-sell + transfer costs: ~8,300 SEK/yr (~21% cost reduction) → 3.6–7.2 yr payback depending on system cost — viable below ~40 kSEK**
- A vendor's simplistic "1 full cycle/day × 1.5 SEK/kWh" claim (~5,585 SEK/yr) sits between the heuristic and LP results; the LP analysis shows *why* both the vendor's math and the naive simulation are wrong.

Golden data: `annual_battery_results.csv` contains the per-day LP results (costs, savings, flows, SoC, cycles, degradation) for the full year — the primary regression fixture for the web engine.

## Known limitations to carry into the tool's design

1. Perfect consumption foreknowledge within the window (solar can be estimated, consumption is not yet).
2. No effekttariff (peak-power tariff) modeling — no data was available, but the tool should make this a pluggable cost component since Swedish DSOs are rolling these out.
3. Battery degradation is linear-in-cycles only (no calendar aging).
4. Grid sell-price modeling is simplistic (spot only, no skattereduktion/energy-tax rebate on export).
5. Single fixed transfer fee per kWh (no time-of-use grid tariffs).
