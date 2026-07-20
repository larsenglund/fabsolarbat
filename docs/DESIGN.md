# UI / UX Design System

Goal: a **modern, sleek, fast** analysis tool that feels like a crafted product, not a spreadsheet. The design language below is Claude-designed for this project: calm cool neutrals, one confident accent, generous whitespace, dense-but-legible data displays, and motion used only to communicate state.

## Principles

1. **The answer first.** The single number people came for — *annual savings and payback* — is the hero of the results view. Everything else supports it.
2. **Never block.** Parameter changes trigger a debounced recompute in a worker; the previous results stay visible but dimmed until fresh numbers arrive (seconds, with per-day progress). No spinners over empty space.
3. **Progressive depth.** Overview → monthly → single day → single hour. Each level is one click, and each chart is a door to the level below it.
4. **Honest numbers.** Assumptions are visible next to results (forecast mode, model variant, extrapolation warnings). No hidden defaults that flatter the battery.
5. **Both themes are first-class.** Light and dark ship together; charts, states and contrast are validated in both.

## Visual language

### Color tokens

Cool neutral grays with a confident blue accent; semantic colors reserved for meaning (savings/costs), never decoration. All accent/text pairings hold WCAG AA (>=4.5:1), enforced by the axe-core e2e scan.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F9FB` | `#15181D` | app background |
| `--surface` | `#FFFFFF` | `#1D2127` | cards, panels |
| `--surface-2` | `#EDF1F5` | `#252A31` | inset areas, table stripes |
| `--border` | `#DBE2EA` | `#363D47` | hairlines |
| `--text` | `#1B1F26` | `#E7EAEE` | primary text |
| `--text-muted` | `#5F6B78` | `#98A2AD` | labels, captions |
| `--accent` | `#2563EB` | `#60A5FA` | primary actions, focus, hero highlights |
| `--accent-strong` | `#2563EB` | `#60A5FA` | filled-button background (paired with `--on-accent`) |
| `--on-accent` | `#FFFFFF` | `#15181D` | text on filled accent controls |
| `--positive` | `#2E7D5B` | `#4CAF8B` | savings, earnings |
| `--negative` | `#B3382E` | `#E06156` | costs, warnings |

Chart series palette (categorical, color-blind-checked in both themes): accent blue, ochre `#B98A2F`, violet `#8461A8`, deep teal `#2C7A8C`, muted plum `#8A5A7E`. Energy-flow charts use fixed semantic hues: solar = ochre, grid = violet, battery = accent blue, SoC = green line.

### Typography

- **UI + headings:** Inter (variable), tight tracking on display sizes.
- **Numbers:** tabular figures everywhere data appears (`font-variant-numeric: tabular-nums`); large results use a 600-weight display cut.
- **Code/CSV previews:** JetBrains Mono.
- Scale: 12 / 13.5 / 15 (body) / 18 / 24 / 32 / 44 with 1.2 line-height on display, 1.55 on body.

### Space, shape, elevation

- 4 px base grid; cards on a 12-column layout, max content width 1320 px.
- Radius: 8 px controls, 12 px cards, 999 px chips. Borders over shadows; a single soft shadow tier for popovers only.

### Motion

- 120–180 ms ease-out for state changes, respecting `prefers-reduced-motion`. No decorative animation.
- Simulation progress: thin accent progress bar under the header + per-day count, never a modal spinner.

## Application layout

```
┌────────────────────────────────────────────────────────────┐
│ Header: wordmark · dataset chip · baseline pin · theme ⋅ ⧉ │
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
3. **Hero results row** — three stat tiles: *Annual savings* (SEK + %), *Payback* (years, colored by viability), *10-yr net vs. index fund*. Each tile shows a delta chip against the pinned baseline, when one is set.
4. **Baseline pin** — one click freezes the current result as a baseline; subsequent parameter changes show deltas everywhere (hero chips, overlaid projection curve). The active scenario's parameters encode to the URL for sharing.
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
