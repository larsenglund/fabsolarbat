import { useState } from "react";
import type { PeakSample } from "../engine/powerTariff";
import { getPowerTariff, monthLabel } from "../engine/powerTariff";
import { formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

function peakList(peaks: PeakSample[]): string {
  return peaks
    .map((p) => {
      const iso = new Date(p.t).toISOString();
      return `${iso.slice(5, 10)} ${iso.slice(11, 13)}h ${p.kw.toFixed(1)} kW`;
    })
    .join(", ");
}

/**
 * Month-by-month effektavgift without and with the battery: billed power
 * (mean of the measured peaks), fee and saving. Only months where the tariff
 * charges anything are listed.
 */
export function PowerFeePanel() {
  const powerFee = useAppStore((s) => s.result?.powerFee ?? null);
  const [showPeaks, setShowPeaks] = useState(false);
  if (!powerFee) return null;
  const tariff = getPowerTariff(powerFee.tariffId);
  const months = powerFee.months.filter((m) => m.priceSekPerKw > 0);

  return (
    <section
      aria-label="Effektavgift per month"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Effektavgift per month</h3>
        <button
          type="button"
          onClick={() => setShowPeaks(!showPeaks)}
          aria-expanded={showPeaks}
          className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text"
        >
          {showPeaks ? "Hide peak hours" : "Show peak hours"}
        </button>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {tariff?.operator}: billed power is the mean of the month's {tariff?.peaksPerMonth} highest
        measured hours{tariff?.onePeakPerDay ? " (on different days)" : ""}. The optimizer plans for
        this fee and the energy price together.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-right text-xs tabular-nums">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-1 pr-2 text-left font-normal">Month</th>
              <th className="px-2 font-normal">kr/kW</th>
              <th className="px-2 font-normal">Peak, no battery</th>
              <th className="px-2 font-normal">Peak, battery</th>
              <th className="px-2 font-normal">Fee, no battery</th>
              <th className="px-2 font-normal">Fee, battery</th>
              <th className="pl-2 font-normal">Saved</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.monthKey} className="border-b border-border/50 align-top">
                <td className="py-0.5 pr-2 text-left">
                  {monthLabel(m.monthKey)}
                  {showPeaks && (
                    <div className="mt-0.5 max-w-[16rem] whitespace-normal text-[11px] leading-snug text-text-muted">
                      <div>no battery: {peakList(m.baselinePeaks)}</div>
                      <div>battery: {peakList(m.optimizedPeaks)}</div>
                    </div>
                  )}
                </td>
                <td className="px-2">{m.priceSekPerKw}</td>
                <td className="px-2">{m.baselineKw.toFixed(2)} kW</td>
                <td className="px-2">{m.optimizedKw.toFixed(2)} kW</td>
                <td className="px-2">{formatSek(m.baselineFee)}</td>
                <td className="px-2">{formatSek(m.optimizedFee)}</td>
                <td className="pl-2">{formatSek(m.savings)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="py-1 pr-2 text-left">Total</td>
              <td className="px-2" />
              <td className="px-2" />
              <td className="px-2" />
              <td className="px-2">{formatSek(powerFee.baselineFee)}</td>
              <td className="px-2">{formatSek(powerFee.optimizedFee)}</td>
              <td className="pl-2">{formatSek(powerFee.savings)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
