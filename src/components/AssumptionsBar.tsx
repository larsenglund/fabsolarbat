import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";

/** Copies the current URL — which always encodes the active scenario. */
function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions, http): select-nothing fallback —
      // the URL is already in the address bar for manual copying.
      window.prompt("Copy this link:", window.location.href);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text"
      title="Copy a link that reproduces these parameters (your data is never in the link)"
    >
      {copied ? "Copied ✓" : "Copy link"}
    </button>
  );
}

/**
 * Freeze the current result as an A/B baseline; the hero tiles then show
 * deltas against it as parameters change.
 */
function PinBaselineButton() {
  const baseline = useAppStore((s) => s.baseline);
  const result = useAppStore((s) => s.result);
  const progress = useAppStore((s) => s.progress);
  const pinBaseline = useAppStore((s) => s.pinBaseline);
  const clearBaseline = useAppStore((s) => s.clearBaseline);

  if (baseline) {
    return (
      <button
        type="button"
        onClick={clearBaseline}
        className="rounded-md border border-accent/50 px-2 py-0.5 text-xs text-accent transition-colors hover:border-accent"
        title="Remove the pinned baseline"
      >
        Baseline pinned · unpin
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={pinBaseline}
      disabled={!result || progress !== null}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text disabled:opacity-50"
      title="Freeze the current result as a baseline and compare against it as you change parameters"
    >
      Pin baseline
    </button>
  );
}

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
      <span className="ml-auto flex items-center gap-2">
        <PinBaselineButton />
        <CopyLinkButton />
      </span>
    </div>
  );
}
