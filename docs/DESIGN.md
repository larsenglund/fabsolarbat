# UI / UX Design System

Goal: a **modern, sleek, fast** analysis tool that feels like a crafted product, not a spreadsheet. The design language below is Claude-designed for this project: calm warm neutrals, one confident accent, generous whitespace, dense-but-legible data displays, and motion used only to communicate state.

## Principles

1. **The answer first.** The single number people came for — *annual savings and payback* — is the hero of the results view. Everything else supports it.
2. **Instant feedback.** Every parameter change updates a preview within 100 ms (heuristic engine), with the exact LP result streaming in seconds later. The UI never blocks; stale results dim, they don't disappear.
3. **Progressive depth.** Overview → monthly → single day → single hour. Each level is one click, and each chart is a door to the level below it.
4. **Honest numbers.** Assumptions are visible next to results (forecast mode, model variant, extrapolation warnings). No hidden defaults that flatter the battery.
5. **Both themes are first-class.** Light and dark ship together; charts, states and contrast are validated in both.

## Visual language

### Color tokens

Warm paper neutrals with a terracotta accent; semantic colors reserved for meaning (savings/costs), never decoration.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAF9F5` | `#1F1E1B` | app background |
| `--surface` | `#FFFFFF` | `#282724` | cards, panels |
| `--surface-2` | `#F0EEE6` | `#31302C` | inset areas, table stripes |
| `--border` | `#E3E0D5` | `#3D3B36` | hairlines |
| `--text` | `#1F1E1B` | `#F0EEE6` | primary text |
| `--text-muted` | `#6E6B63` | `#A6A39A` | labels, captions |
| `--accent` | `#C15F3C` | `#D97757` | primary actions, focus, hero highlights |
| `--positive` | `#2E7D5B` | `#4CAF8B` | savings, earnings |
| `--negative` | `#B3382E` | `#E06156` | costs, warnings |

Chart series palette (categorical, color-blind-checked in both themes): accent terracotta, deep teal `#2C7A8C`, ochre `#B98A2F`, slate blue `#5B6B9E`, muted plum `#8A5A7E`. Energy-flow charts use fixed semantic hues: solar = ochre, grid = slate, battery = terracotta, SoC = teal line.

### Typography

- **UI + headings:** Inter (variable), tight tracking on display sizes.
- **Numbers:** tabular figures everywhere data appears (`font-variant-numeric: tabular-nums`); large results use a 600-weight display cut.
- **Code/CSV previews:** JetBrains Mono.
- Scale: 12 / 13.5 / 15 (body) / 18 / 24 / 32 / 44 with 1.2 line-height on display, 1.55 on body.

### Space, shape, elevation

- 4 px base grid; cards on a 12-column layout, max content width 1320 px.
- Radius: 8 px controls, 12 px cards, 999 px chips. Borders over shadows; a single soft shadow tier for popovers only.
- Density toggle on tables (comfortable / compact).

### Motion

- 120–180 ms ease-out for state changes; number tickers animate value changes on result cards (respecting `prefers-reduced-motion`).
- Simulation progress: thin accent progress bar under the header + per-day count, never a modal spinner.

## Application layout

```
┌────────────────────────────────────────────────────────────┐
│ Header: wordmark · dataset chip · scenario tabs · theme ⋅ ⧉ │
├──────────────┬─────────────────────────────────────────────┤
│  Parameter   │  Results canvas                             │
│  sidebar     │  ┌ Hero row: Savings/yr · Payback · ROI ┐   │
│  (sticky,    │  ├ Cost comparison + 10-yr projection   ┤   │
│  collapsible │  ├ Monthly breakdown (bars)             ┤   │
│  groups)     │  ├ Hourly explorer (uPlot, zoomable)    ┤   │
│              │  └ Day drill-down (flows + SoC + table) ┘   │
└──────────────┴─────────────────────────────────────────────┘
```

### Key screens & components

1. **Landing / empty state** — one-sentence pitch, two primary actions: *“Explore sample data”* (loads instantly) and *“Upload your data”*. Small print: “Your data never leaves your browser.”
2. **Parameter sidebar** — grouped, collapsible: Battery · Tariffs & prices · Strategy · Economics. Sliders paired with numeric inputs and unit suffixes; sensible ranges; “reset group” affordances; advanced params behind a disclosure. Every control has a one-line plain-language tooltip.
3. **Hero results row** — three stat tiles: *Annual savings* (SEK + %), *Payback* (years, colored by viability), *10-yr net vs. index fund*. Each tile shows a delta chip when compared against another scenario.
4. **Scenario tabs** — save the current parameter set as a named scenario; up to 4 compared side-by-side (overlaid projection curves, grouped monthly bars, hero deltas). Scenarios encode to the URL for sharing.
5. **Hourly explorer** — full-year price + consumption + solar + SoC as synced uPlot panes; brush to zoom; clicking a day opens the drill-down.
6. **Day drill-down** — stacked hourly flow chart (S→B, G→B, B→H, G→H) over the price curve, SoC line, and the classic hourly breakdown table from the Python tool; prev/next day paging; “most/least profitable day” shortcuts.
7. **Upload wizard** — 3 steps (file → mapping/units → validation report). Live-parsed preview table, auto-detected mapping pre-filled, warnings as inline callouts with counts and examples. Ends on a dataset summary card (coverage, totals, average price).
8. **Assumptions bar** — persistent slim strip above results: model variant, forecast mode, dataset coverage, extrapolation notices. Click to jump to the relevant control.

## Accessibility

- WCAG 2.1 AA contrast in both themes (tokens above validated).
- Full keyboard operability (sliders, tabs, chart focus states with roving tabindex + data table fallbacks).
- Charts always paired with accessible tables or summaries; color never the sole channel (patterns/labels on flows).

## Voice

Plain, direct, lightly Swedish-aware (SEK, öre, spotpris, effekttariff terms explained on hover). No jargon without a tooltip. Numbers rounded to what a human decision needs (savings to whole SEK, payback to 0.1 yr).
