import { type ReactNode, useId, useMemo } from "react";
import { getPowerTariff, POWER_TARIFFS, type PowerTariffId } from "../engine/powerTariff";
import type { MarketModel, SolarForecastMethod } from "../engine/types";
import { useAppStore } from "../store/appStore";
import { LabeledField, ParamField } from "./ParamField";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="border-b border-border py-3 last:border-b-0">
      <summary className="cursor-pointer select-none text-sm font-medium marker:text-text-muted">
        {title}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

const FORECASTS: { value: SolarForecastMethod; label: string }[] = [
  { value: "hybrid", label: "Hybrid (morning-scaled, default)" },
  { value: "simple", label: "3-day average" },
  { value: "weighted", label: "Weighted 5-day average" },
  { value: "persistence", label: "Persistence (yesterday repeats)" },
  { value: "perfect", label: "Perfect (unrealistic upper bound)" },
];

const SPOT_SCALE_MIN = 0.25;
const SPOT_SCALE_MAX = 3;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Spot price level: a multiplier on the dataset's hourly spot prices, plus the
 * resulting average spot price — which can also be typed to hit a target
 * level directly (e.g. another year's average).
 */
function SpotPriceLevel() {
  const scale = useAppStore((s) => s.params.tariff.spotPriceScale);
  const dataset = useAppStore((s) => s.dataset);
  const setParams = useAppStore((s) => s.setParams);
  const targetId = useId();
  const meanSpot = useMemo(
    () =>
      dataset && dataset.length > 0
        ? dataset.reduce((s, h) => s + h.priceSekPerKwh, 0) / dataset.length
        : null,
    [dataset],
  );
  const setScale = (v: number) => setParams({ tariff: { spotPriceScale: v } });
  const setTarget = (raw: string) => {
    const n = Number(raw);
    if (meanSpot === null || !Number.isFinite(n)) return;
    setScale(Math.min(SPOT_SCALE_MAX, Math.max(SPOT_SCALE_MIN, round3(n / meanSpot))));
  };

  return (
    <ParamField
      label="Spot price level"
      unit="×"
      value={scale}
      min={SPOT_SCALE_MIN}
      max={SPOT_SCALE_MAX}
      step={0.05}
      help="A what-if for other price years: every hourly spot price in the data is multiplied by this factor before VAT and fees are added (1.00 = the prices as recorded). The price level and the daily swings between cheap and expensive hours scale together, and negative prices get more negative — roughly what a pricier, more volatile year looks like. The average below is the plain hourly average of the spot price, excluding VAT; type a target average there to set the factor directly. A single analyzed year can be unusually cheap or expensive (2024 was cheap in SE3, 2022 extremely expensive), so this is a quick way to see how much the result depends on it."
      onChange={setScale}
    >
      {meanSpot !== null && meanSpot > 0.001 && (
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs text-text-muted">
          <label htmlFor={targetId} className="whitespace-nowrap" title="Excluding VAT">
            Avg. spot price
          </label>
          <span className="ml-auto flex items-baseline gap-1 whitespace-nowrap tabular-nums">
            {meanSpot.toFixed(3)} →
            <input
              id={targetId}
              type="number"
              value={round3(meanSpot * scale)}
              min={0}
              step={0.01}
              onChange={(e) => setTarget(e.target.value)}
              className="w-16 rounded-md border border-border bg-surface px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-accent focus:outline-none"
            />
            kr/kWh
          </span>
        </div>
      )}
    </ParamField>
  );
}

export function ParamSidebar() {
  const params = useAppStore((s) => s.params);
  const finance = useAppStore((s) => s.finance);
  const setParams = useAppStore((s) => s.setParams);
  const setFinance = useAppStore((s) => s.setFinance);
  const resetParams = useAppStore((s) => s.resetParams);
  const b = params.battery;
  const t = params.tariff;
  const powerTariff = getPowerTariff(t.powerTariff);

  return (
    <aside className="w-full shrink-0 lg:w-72" aria-label="Simulation parameters">
      <div className="rounded-xl border border-border bg-surface px-4 py-2">
        <Group title="Battery">
          <ParamField
            label="Usable capacity"
            unit="kWh"
            value={b.usableCapacityKwh}
            min={1}
            max={30}
            step={0.1}
            help="How much energy the battery can actually store and deliver, in kilowatt-hours. Note that spec sheets often quote the larger gross capacity — use the usable figure (for example, a '15.36 kWh' battery may offer 13.82 kWh usable). Bigger batteries can shift more energy per day but cost more, so this is the main size-vs-price trade-off."
            onChange={(v) => setParams({ battery: { usableCapacityKwh: v } })}
          />
          <ParamField
            label="Max power"
            unit="kW"
            value={b.maxPowerKw}
            min={0.5}
            max={15}
            step={0.1}
            help="The fastest rate at which the battery can charge or discharge. A high-capacity battery with low power can't empty itself during a short expensive evening peak, so power matters almost as much as capacity for price arbitrage."
            onChange={(v) => setParams({ battery: { maxPowerKw: v } })}
          />
          <ParamField
            label="Efficiency (one-way)"
            unit="%"
            value={Math.round(b.acEfficiency * 1000) / 10}
            min={80}
            max={99}
            step={0.5}
            help="How much energy survives each conversion, applied once when charging and once when discharging. At 95% one-way, storing 1 kWh and using it later returns about 0.90 kWh (95% × 95%). This loss is why the battery only acts when the price gap is big enough to pay for it."
            onChange={(v) => setParams({ battery: { acEfficiency: v / 100 } })}
          />
          <ParamField
            label="Depth of discharge"
            unit="%"
            value={b.depthOfDischargePercent}
            min={50}
            max={100}
            step={1}
            help="How much of the capacity may be used before the battery stops discharging. 90% means it always keeps a 10% reserve — a common manufacturer setting that protects battery lifetime at the cost of a little usable energy."
            onChange={(v) => setParams({ battery: { depthOfDischargePercent: v } })}
          />
          <ParamField
            label="Cycle life"
            unit="cycles"
            value={b.cyclesToEol}
            min={1000}
            max={15000}
            step={500}
            help="How many full charge-discharge cycles the battery endures before reaching its end-of-life capacity (next parameter). The simulation counts every discharged kWh toward this budget, so a hard-working battery ages faster and saves slightly less each year."
            onChange={(v) => setParams({ battery: { cyclesToEol: v } })}
          />
          <ParamField
            label="End-of-life capacity"
            unit="%"
            value={b.eolCapacityPercent}
            min={50}
            max={90}
            step={1}
            help="The share of original capacity remaining after the full cycle life — 70% is a typical warranty figure. Between new and end-of-life, capacity is assumed to fade linearly with use, which the long-term projections take into account."
            onChange={(v) => setParams({ battery: { eolCapacityPercent: v } })}
          />
        </Group>

        <Group title="Tariffs & prices">
          <SpotPriceLevel />
          <ParamField
            label="VAT on spot"
            unit="×"
            value={t.vatMultiplier}
            min={1}
            max={1.5}
            step={0.01}
            help="Value-added tax applied to the electricity you buy, as a multiplier on the spot price. In Sweden this is 25%, so the default is 1.25. Set to 1.00 to analyze prices without tax."
            onChange={(v) => setParams({ tariff: { vatMultiplier: v } })}
          />
          <ParamField
            label="Grid transfer fee"
            unit="kr/kWh"
            value={t.transferFeeSekPerKwh}
            min={0}
            max={2}
            step={0.005}
            help="Everything you pay per purchased kWh besides the spot price, VAT on spot, and retailer markup: the grid operator's transfer charge PLUS the Swedish energy tax (energiskatt), including their VAT — both usually appear on your grid bill. In 2024 the energy tax alone was ~0.55 kr/kWh incl. VAT, so check that your total here isn't too low. It applies to every purchased kWh, which is why avoiding purchases (using stored solar) is worth more than the spot price alone suggests."
            onChange={(v) => setParams({ tariff: { transferFeeSekPerKwh: v } })}
          />
          <ParamField
            label="Retailer markup"
            unit="kr/kWh"
            value={t.fixedMarkupSekPerKwh}
            min={0}
            max={1}
            step={0.01}
            help="Any fixed per-kWh surcharge your electricity retailer adds on top of the spot price on a variable-price contract. Enter it including VAT, as it appears on your bill. Often a few öre per kWh; monthly fixed fees don't belong here since the battery can't affect them."
            onChange={(v) => setParams({ tariff: { fixedMarkupSekPerKwh: v } })}
          />
          <LabeledField
            label="Power tariff (effektavgift)"
            htmlFor="power-tariff"
            help="A monthly grid fee based on your highest hourly power draw (kW) rather than on energy (kWh). A battery can lower it by covering the house's consumption during the measured peak hours — and must avoid creating new peaks when it charges from the grid. When a tariff is selected, the optimizer plans for both the energy price and the peak fee, and the fee difference is added to the savings. Pick your grid operator's tariff; remember to also set the grid transfer fee above to that operator's per-kWh fee (plus energy tax)."
          >
            <select
              id="power-tariff"
              value={t.powerTariff ?? "none"}
              onChange={(e) =>
                setParams({
                  tariff: {
                    powerTariff:
                      e.target.value === "none" ? null : (e.target.value as PowerTariffId),
                  },
                })
              }
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
            >
              <option value="none">None</option>
              {Object.values(POWER_TARIFFS).map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.label}
                </option>
              ))}
            </select>
            {powerTariff && (
              <div className="mt-1.5 text-xs leading-relaxed text-text-muted">
                <p>
                  {powerTariff.rules}{" "}
                  <a
                    href={powerTariff.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-strong underline underline-offset-2"
                  >
                    Source ↗
                  </a>
                </p>
                {t.transferFeeSekPerKwh !== powerTariff.transferFeeSekPerKwh && (
                  <button
                    type="button"
                    onClick={() =>
                      setParams({
                        tariff: { transferFeeSekPerKwh: powerTariff.transferFeeSekPerKwh },
                      })
                    }
                    className="mt-1.5 w-full rounded-md border border-border px-2 py-1 text-left transition-colors hover:border-accent hover:text-text"
                  >
                    Use {powerTariff.operator}'s per-kWh fee as grid transfer fee:{" "}
                    {powerTariff.transferFeeSekPerKwh} kr/kWh ({powerTariff.transferFeeNote})
                  </button>
                )}
              </div>
            )}
          </LabeledField>
        </Group>

        <Group title="Strategy">
          <LabeledField
            label="Excess solar"
            htmlFor="market-model"
            help="What happens to solar power you don't use or store. 'Not sold' assumes exports earn nothing — no export contract; a worst case that flatters the battery. 'Sold at spot + bonus' credits every exported kWh at the spot price plus the export bonus — in both the no-battery baseline and the battery scenario — so charging the battery from solar has a real cost: the sale you gave up."
          >
            <select
              id="market-model"
              value={params.strategy.model}
              onChange={(e) => setParams({ strategy: { model: e.target.value as MarketModel } })}
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
            >
              <option value="no-sell">Not sold (wasted)</option>
              <option value="sell-at-spot">Sold at spot + bonus</option>
            </select>
          </LabeledField>
          {params.strategy.model === "sell-at-spot" && (
            <ParamField
              label="Export bonus"
              unit="kr/kWh"
              value={t.sellBonusSekPerKwh}
              min={0}
              max={0.5}
              step={0.005}
              help="Extra compensation per exported kWh on top of the spot price: the grid-benefit payment from your grid operator and any bonus from your retailer, typically a few öre in total. Sweden's former 0.60 kr/kWh tax reduction for exported solar has been abolished and is deliberately not included."
              onChange={(v) => setParams({ tariff: { sellBonusSekPerKwh: v } })}
            />
          )}
          <LabeledField
            label="Solar forecast during planning"
            htmlFor="forecast"
            help="Each day at 13:00 the optimizer plans ahead using known electricity prices — but future solar production must be estimated. 'Hybrid' scales the recent average by how sunny this morning actually was. 'Perfect' pretends tomorrow's solar is known exactly, which overstates what a real system can achieve; the other methods are simpler historical averages."
          >
            <select
              id="forecast"
              value={params.strategy.solarForecast ?? "hybrid"}
              onChange={(e) =>
                setParams({ strategy: { solarForecast: e.target.value as SolarForecastMethod } })
              }
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
            >
              {FORECASTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </LabeledField>
          <ParamField
            label="Planning window"
            unit="h"
            value={params.strategy.windowHours}
            min={24}
            max={47}
            step={1}
            help="How many hours of known prices the optimizer plans over at each day's 13:00 planning point. Nord Pool publishes the next day's hourly prices around 13:00, so 35 hours (until midnight tomorrow) matches reality. Longer windows are what-if scenarios that assume prices further ahead were known."
            onChange={(v) => setParams({ strategy: { windowHours: v } })}
          />
        </Group>

        <Group title="Economics">
          <ParamField
            label="System cost"
            unit="kr"
            value={finance.systemCostSek}
            min={10000}
            max={150000}
            step={1000}
            help="The full installed price of the battery system: hardware, installation, and any electrical work. Payback and return figures are extremely sensitive to this number, so get real quotes."
            onChange={(v) => setFinance({ systemCostSek: v })}
          />
          <ParamField
            label="Horizon"
            unit="yr"
            value={finance.horizonYears}
            min={5}
            max={25}
            step={1}
            help="How many years the investment is evaluated over. Batteries are often warrantied for about 10 years; a longer horizon favors the battery but assumes it keeps working."
            onChange={(v) => setFinance({ horizonYears: v })}
          />
          <ParamField
            label="Discount rate"
            unit="%"
            value={Math.round(finance.discountRate * 1000) / 10}
            min={0}
            max={10}
            step={0.5}
            help="Used for the net-present-value calculation: money saved years from now is worth less than money today. A rate around inflation or a safe interest rate is common; higher rates make future savings count for less."
            onChange={(v) => setFinance({ discountRate: v / 100 })}
          />
          <ParamField
            label="Alternative return"
            unit="%"
            value={Math.round(finance.alternativeReturnRate * 1000) / 10}
            min={0}
            max={12}
            step={0.5}
            help="What the same money could plausibly earn per year if invested elsewhere, for example a broad index fund. The comparison shows the opportunity cost of buying a battery instead of investing."
            onChange={(v) => setFinance({ alternativeReturnRate: v / 100 })}
          />
        </Group>

        <button
          type="button"
          onClick={resetParams}
          className="my-3 w-full rounded-lg border border-border px-3 py-1.5 text-[13px] text-text-muted transition-colors hover:text-text"
        >
          Reset to reference values
        </button>
      </div>
    </aside>
  );
}
