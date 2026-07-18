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
- LP-optimal, 35 h window, no-sell + transfer costs, **as reported by the Python analysis**: ~8,300 SEK/yr (~21%) → 3.6–7.2 yr payback — *see the corrections below; this figure is inflated*
- A vendor's simplistic "1 full cycle/day × 1.5 SEK/kWh" claim (~5,585 SEK/yr) sits between the heuristic and LP results.

## ⚠️ Corrections found while porting (M1 code review)

Auditing the model during the TypeScript port surfaced accounting errors in the Python analysis. The LP itself is sound; the *reporting* around it was not:

1. **Window-overlap double-counting (large).** Each 35 h window is summed in full into its day's result, but windows advance only 24 h — every 13:00–24:00 period lands in two windows, and energy charged once gets its discharge value counted in both the never-executed window tail *and* the next day's executed hours. Summing windows gives an annual baseline of 37,905 SEK vs the true 25,164 SEK, and savings of 7,772 SEK vs the true **3,967 SEK/yr (15.8% cost reduction)** when each hour is counted exactly once ("executed-hours" accounting: the first 24 h of each window, since the tail is re-planned the next day). Battery cycles are likewise 527/yr window-summed vs **336/yr executed**.
2. **Payback off-by-one (+1 year).** The Python payback interpolation adds the year fraction to the 1-indexed year (`year + fraction` instead of `year − 1 + fraction`), overstating every payback figure by exactly one year. The engine fixes this.
3. **Corrected bottom line (no-sell model, executed accounting, degradation-aware):** ~3,967 SEK/yr savings; payback ≈ **11 yr at 40 kSEK / 14 yr at 50 kSEK / 24 yr at 75 kSEK** system cost; 10-year ROI is negative at all of those price points. The prior "viable below 40 kSEK" conclusion does not survive the corrections.
4. **The no-sell caveat cuts further.** The model values solar diverted into the battery at zero, but a real Swedish PV household sells excess solar (spot + skattereduktion 0.60 SEK/kWh through 2025 + nätnytta). The ~2,480 kWh/yr the optimizer routes into the battery has a real opportunity cost on the order of 800–2,200 SEK/yr depending on the export-compensation rules assumed — pushing net benefit lower still. Modeling export revenue properly is on the roadmap (sell-at-spot variant).

Golden data: `annual_battery_results.csv` contains the per-day LP results (costs, savings, flows, SoC, cycles, degradation) for the full year — the primary regression fixture for the web engine.

## Known limitations to carry into the tool's design

1. Perfect consumption foreknowledge within the window (solar can be estimated, consumption is not yet).
2. No effekttariff (peak-power tariff) modeling — no data was available, but the tool should make this a pluggable cost component since Swedish DSOs are rolling these out.
3. Battery degradation is linear-in-cycles only (no calendar aging), and the in-simulation cycle counter uses window-summed discharge (inflated ~1.57×, i.e. degradation is conservative). Finance projections use executed cycles.
4. Grid sell-price modeling is absent (no-sell); foregone export revenue on solar diverted to the battery is not costed (see Corrections §4).
5. Single fixed transfer fee per kWh (no time-of-use grid tariffs).
6. The house main fuse (~13.9 kW for 20 A × 400 V) is computed in the Python code but never enforced as a constraint — on the 2024 data the optimizer schedules grid draw up to ~19.8 kW in 56 hours, which a real installation could not do. A grid-draw cap parameter is planned.
7. The meter data is hourly-netted, so the model permits same-hour solar "pass-through" via the battery (~259 kWh/yr here, worth ~250–300 SEK) — defensible given sub-hourly variation, but worth knowing.
8. The hybrid solar forecast's "historical morning average" includes today's own morning rows, damping its scale factor toward 1 (ported faithfully).
