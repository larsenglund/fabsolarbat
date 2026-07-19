import { useAppStore } from "../store/appStore";

/** Slim persistent strip keeping the result's assumptions visible (DESIGN §8). */
export function AssumptionsBar() {
  const meta = useAppStore((s) => s.datasetMeta);
  const forecast = useAppStore((s) => s.params.strategy.solarForecast);
  const model = useAppStore((s) => s.params.strategy.model);
  const sellBonus = useAppStore((s) => s.params.tariff.sellBonusSekPerKwh);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      {model === "sell-at-spot" ? (
        <span title="Sweden's former 0.60 kr/kWh tax reduction for exported solar is abolished and not included">
          Sell-at-spot model (export earns spot + {sellBonus.toFixed(2)} kr/kWh)
        </span>
      ) : (
        <span>No-sell model (excess solar earns nothing)</span>
      )}
      <span aria-hidden>·</span>
      <span>{forecast ?? "perfect"} solar forecast</span>
      {meta && (
        <>
          <span aria-hidden>·</span>
          <span>
            {meta.label} — {meta.hours.toLocaleString("sv-SE")} h, {meta.firstDay} → {meta.lastDay}
          </span>
        </>
      )}
      <span aria-hidden>·</span>
      <span title="Each simulated hour is counted exactly once — overlapping planning windows are not double-counted">
        executed-hours accounting
      </span>
    </div>
  );
}
