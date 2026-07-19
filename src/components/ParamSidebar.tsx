import type { ReactNode } from "react";
import type { SolarForecastMethod } from "../engine/types";
import { useAppStore } from "../store/appStore";
import { ParamField } from "./ParamField";

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

export function ParamSidebar() {
  const params = useAppStore((s) => s.params);
  const finance = useAppStore((s) => s.finance);
  const setParams = useAppStore((s) => s.setParams);
  const setFinance = useAppStore((s) => s.setFinance);
  const resetParams = useAppStore((s) => s.resetParams);
  const b = params.battery;
  const t = params.tariff;

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
            hint="Usable energy content, before degradation"
            onChange={(v) => setParams({ battery: { usableCapacityKwh: v } })}
          />
          <ParamField
            label="Max power"
            unit="kW"
            value={b.maxPowerKw}
            min={0.5}
            max={15}
            step={0.1}
            hint="Charge and discharge power limit"
            onChange={(v) => setParams({ battery: { maxPowerKw: v } })}
          />
          <ParamField
            label="Efficiency (one-way)"
            unit="%"
            value={Math.round(b.acEfficiency * 1000) / 10}
            min={80}
            max={99}
            step={0.5}
            hint="AC efficiency applied on charge and again on discharge"
            onChange={(v) => setParams({ battery: { acEfficiency: v / 100 } })}
          />
          <ParamField
            label="Depth of discharge"
            unit="%"
            value={b.depthOfDischargePercent}
            min={50}
            max={100}
            step={1}
            hint="90% means the battery never discharges below 10% state of charge"
            onChange={(v) => setParams({ battery: { depthOfDischargePercent: v } })}
          />
          <ParamField
            label="Cycle life"
            unit="cycles"
            value={b.cyclesToEol}
            min={1000}
            max={15000}
            step={500}
            hint="Full cycles until capacity reaches the end-of-life level"
            onChange={(v) => setParams({ battery: { cyclesToEol: v } })}
          />
          <ParamField
            label="End-of-life capacity"
            unit="%"
            value={b.eolCapacityPercent}
            min={50}
            max={90}
            step={1}
            hint="Remaining capacity after the rated cycle life"
            onChange={(v) => setParams({ battery: { eolCapacityPercent: v } })}
          />
        </Group>

        <Group title="Tariffs & prices">
          <ParamField
            label="VAT on spot"
            unit="×"
            value={t.vatMultiplier}
            min={1}
            max={1.5}
            step={0.01}
            hint="Multiplier on the spot price (1.25 = 25% VAT)"
            onChange={(v) => setParams({ tariff: { vatMultiplier: v } })}
          />
          <ParamField
            label="Grid transfer fee"
            unit="kr/kWh"
            value={t.transferFeeSekPerKwh}
            min={0}
            max={2}
            step={0.005}
            hint="Överföringsavgift per purchased kWh, incl. VAT"
            onChange={(v) => setParams({ tariff: { transferFeeSekPerKwh: v } })}
          />
          <ParamField
            label="Retailer markup"
            unit="kr/kWh"
            value={t.fixedMarkupSekPerKwh}
            min={0}
            max={1}
            step={0.01}
            hint="Påslag per kWh on top of spot"
            onChange={(v) => setParams({ tariff: { fixedMarkupSekPerKwh: v } })}
          />
        </Group>

        <Group title="Strategy">
          <div className="py-1.5">
            <label htmlFor="forecast" className="text-[13px] text-text-muted">
              Solar forecast during planning
            </label>
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
          </div>
          <ParamField
            label="Planning window"
            unit="h"
            value={params.strategy.windowHours}
            min={24}
            max={47}
            step={1}
            hint="Hours of known prices at each 13:00 planning point (35 = until midnight tomorrow)"
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
            hint="Installed battery system price"
            onChange={(v) => setFinance({ systemCostSek: v })}
          />
          <ParamField
            label="Horizon"
            unit="yr"
            value={finance.horizonYears}
            min={5}
            max={25}
            step={1}
            hint="Evaluation horizon for ROI and NPV"
            onChange={(v) => setFinance({ horizonYears: v })}
          />
          <ParamField
            label="Discount rate"
            unit="%"
            value={Math.round(finance.discountRate * 1000) / 10}
            min={0}
            max={10}
            step={0.5}
            hint="For net present value of future savings"
            onChange={(v) => setFinance({ discountRate: v / 100 })}
          />
          <ParamField
            label="Alternative return"
            unit="%"
            value={Math.round(finance.alternativeReturnRate * 1000) / 10}
            min={0}
            max={12}
            step={0.5}
            hint="Expected annual return if the money went into e.g. an index fund"
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
