import { useMemo } from "react";
import { formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

/** Naive-UTC ms → "sön 14 jan" style label + ISO date. */
function dayLabel(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
function hourLabel(t: number): string {
  return new Date(t).toISOString().slice(11, 16);
}

/**
 * One planning window in full detail: charge/discharge flows + SoC chart and
 * the classic hourly table from the Python tool. Hours past the executed
 * boundary are the plan's tail — re-planned the next day — and shown dimmed.
 */
export function DayDrilldown() {
  const result = useAppStore((s) => s.result);
  const selected = useAppStore((s) => s.selectedDay);
  const selectDay = useAppStore((s) => s.selectDay);

  const bestWorst = useMemo(() => {
    if (!result) return null;
    let best = 0;
    let worst = 0;
    result.days.forEach((d, i) => {
      if (d.executedSavings > result.days[best].executedSavings) best = i;
      if (d.executedSavings < result.days[worst].executedSavings) worst = i;
    });
    return { best, worst };
  }, [result]);

  if (!result || selected === null) return null;
  const day = result.days[selected];
  if (!day?.hourly) return null;
  const hourly = day.hourly;

  const W = 900;
  const H = 200;
  const pad = { top: 10, bottom: 18, left: 8, right: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const zeroY = pad.top + innerH * 0.55;
  const maxFlow = Math.max(
    0.5,
    ...hourly.map((h) => Math.max(h.solarToBattery + h.gridToBattery, h.batteryToHome)),
  );
  const maxSoc = Math.max(1, ...hourly.map((h) => h.soc));
  const colW = innerW / hourly.length;
  const barW = colW * 0.6;
  const chargeH = (v: number) => (v / maxFlow) * (zeroY - pad.top);
  const dischargeH = (v: number) => (v / maxFlow) * (pad.top + innerH - zeroY);
  const socY = (v: number) => pad.top + (1 - v / maxSoc) * innerH;

  return (
    <section aria-label="Day detail" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Day {day.dayNumber} — {dayLabel(day.t)} 13:00 → +{hourly.length} h
        </h3>
        <div className="flex items-center gap-1 text-xs">
          {bestWorst && (
            <>
              <button
                type="button"
                onClick={() => selectDay(bestWorst.best)}
                className="rounded-md border border-border px-2 py-1 hover:border-accent"
              >
                best day
              </button>
              <button
                type="button"
                onClick={() => selectDay(bestWorst.worst)}
                className="rounded-md border border-border px-2 py-1 hover:border-accent"
              >
                worst day
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => selectDay(Math.max(0, selected - 1))}
            className="rounded-md border border-border px-2 py-1 hover:border-accent"
            aria-label="Previous day"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => selectDay(Math.min(result.days.length - 1, selected + 1))}
            className="rounded-md border border-border px-2 py-1 hover:border-accent"
            aria-label="Next day"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => selectDay(null)}
            className="rounded-md border border-border px-2 py-1 hover:border-accent"
            aria-label="Close day detail"
          >
            ✕
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-text-muted">
        Executed savings {formatSek(day.executedSavings)} over the first {day.executedHours} h ·
        window savings {formatSek(day.savings)} · initial SoC {day.initialSoc.toFixed(2)} kWh
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Hourly charge and discharge flows with state of charge"
      >
        <title>Charge (up) and discharge (down) per hour; line = state of charge</title>
        <line
          x1={pad.left}
          x2={W - pad.right}
          y1={zeroY}
          y2={zeroY}
          className="stroke-border"
          strokeWidth={1}
        />
        {/* Executed-boundary shading over the re-planned tail */}
        {day.executedHours < hourly.length && (
          <rect
            x={pad.left + colW * day.executedHours}
            y={pad.top}
            width={colW * (hourly.length - day.executedHours)}
            height={innerH}
            className="fill-text-muted"
            opacity={0.07}
          />
        )}
        {hourly.map((h, i) => {
          const cx = pad.left + colW * i + (colW - barW) / 2;
          const s2bH = chargeH(h.solarToBattery);
          const g2bH = chargeH(h.gridToBattery);
          const b2hH = dischargeH(h.batteryToHome);
          return (
            <g key={h.t} opacity={i < day.executedHours ? 1 : 0.45}>
              {h.gridToBattery > 0.005 && (
                <rect x={cx} y={zeroY - g2bH} width={barW} height={g2bH} fill="#5b6b9e">
                  <title>{`${hourLabel(h.t)} grid→battery ${h.gridToBattery.toFixed(2)} kWh`}</title>
                </rect>
              )}
              {h.solarToBattery > 0.005 && (
                <rect x={cx} y={zeroY - g2bH - s2bH} width={barW} height={s2bH} fill="#b98a2f">
                  <title>{`${hourLabel(h.t)} solar→battery ${h.solarToBattery.toFixed(2)} kWh`}</title>
                </rect>
              )}
              {h.batteryToHome > 0.005 && (
                <rect x={cx} y={zeroY} width={barW} height={b2hH} className="fill-accent">
                  <title>{`${hourLabel(h.t)} battery→home ${h.batteryToHome.toFixed(2)} kWh`}</title>
                </rect>
              )}
              {i % 3 === 0 && (
                <text
                  x={cx + barW / 2}
                  y={H - 4}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-text-muted"
                >
                  {hourLabel(h.t).slice(0, 2)}
                </text>
              )}
            </g>
          );
        })}
        <polyline
          points={hourly
            .map((h, i) => `${pad.left + colW * i + colW / 2},${socY(h.soc)}`)
            .join(" ")}
          fill="none"
          className="stroke-positive"
          strokeWidth={1.5}
        />
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-text-muted">
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5" style={{ background: "#b98a2f" }} />{" "}
          solar→battery
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5" style={{ background: "#5b6b9e" }} />{" "}
          grid→battery
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 bg-accent" /> battery→home
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 translate-y-[-2px] bg-positive" /> state of
          charge
        </span>
        <span className="opacity-70">shaded = plan tail, re-planned next day</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-right text-xs tabular-nums">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-1 pr-2 text-left font-normal">Hour</th>
              <th className="px-2 font-normal">Cons</th>
              <th className="px-2 font-normal">Solar</th>
              <th className="px-2 font-normal">Price</th>
              <th className="px-2 font-normal">SoC</th>
              <th className="px-2 font-normal">S→B</th>
              <th className="px-2 font-normal">G→B</th>
              <th className="px-2 font-normal">B→H</th>
              <th className="px-2 font-normal">G→H</th>
              <th className="px-2 font-normal">Exp</th>
              <th className="pl-2 font-normal">Cost</th>
            </tr>
          </thead>
          <tbody>
            {hourly.map((h, i) => (
              <tr
                key={h.t}
                className={`border-b border-border/50 ${i < day.executedHours ? "" : "opacity-45"}`}
              >
                <td className="py-0.5 pr-2 text-left">{hourLabel(h.t)}</td>
                <td className="px-2">{h.consumptionKwh.toFixed(2)}</td>
                <td className="px-2">{h.excessSolarKwh.toFixed(2)}</td>
                <td className="px-2">{h.fullPrice.toFixed(3)}</td>
                <td className="px-2">{h.soc.toFixed(2)}</td>
                <td className="px-2">{h.solarToBattery.toFixed(2)}</td>
                <td className="px-2">{h.gridToBattery.toFixed(2)}</td>
                <td className="px-2">{h.batteryToHome.toFixed(2)}</td>
                <td className="px-2">{(h.consumptionKwh - h.batteryToHome).toFixed(2)}</td>
                <td className="px-2">{h.exportKwh.toFixed(2)}</td>
                <td className="pl-2">{h.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
