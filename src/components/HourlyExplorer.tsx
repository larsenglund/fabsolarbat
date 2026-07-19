import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { bestWorstDays } from "../lib/days";
import { useAppStore } from "../store/appStore";

interface ExecutedSeries {
  ts: number[]; // seconds, naive-UTC
  price: number[];
  soc: number[];
  dayIndexByPoint: number[];
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

/**
 * Full-year executed hourly series (price + state of charge), zoomable via
 * drag; clicking opens the day drill-down for the clicked hour's day.
 */
export function HourlyExplorer() {
  const result = useAppStore((s) => s.result);
  const selectDay = useAppStore((s) => s.selectDay);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const series = useMemo<ExecutedSeries | null>(() => {
    if (!result) return null;
    const ts: number[] = [];
    const price: number[] = [];
    const soc: number[] = [];
    const dayIndexByPoint: number[] = [];
    for (let d = 0; d < result.days.length; d++) {
      const day = result.days[d];
      if (!day.hourly) continue;
      for (let i = 0; i < day.executedHours; i++) {
        const h = day.hourly[i];
        ts.push(h.t / 1000);
        price.push(h.fullPrice);
        soc.push(h.soc);
        dayIndexByPoint.push(d);
      }
    }
    return ts.length > 0 ? { ts, price, soc, dayIndexByPoint } : null;
  }, [result]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !series) return;

    const opts: uPlot.Options = {
      width: container.clientWidth,
      height: 260,
      // Timestamps are naive local time stored as UTC — render them verbatim.
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), "Etc/UTC"),
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: true } },
      axes: [
        { stroke: cssVar("--text-muted"), grid: { stroke: `${cssVar("--border")}80` } },
        {
          scale: "price",
          stroke: cssVar("--accent"),
          grid: { stroke: `${cssVar("--border")}80` },
          size: 46,
        },
        { scale: "soc", side: 1, stroke: cssVar("--positive"), grid: { show: false }, size: 40 },
      ],
      series: [
        {},
        {
          // Drawn first (under the price line); translucent so the dense
          // full-year charge/discharge texture doesn't drown the prices.
          label: "SoC (kWh)",
          scale: "soc",
          stroke: `${cssVar("--positive")}59`,
          width: 1,
          points: { show: false },
        },
        {
          label: "Price (kr/kWh)",
          scale: "price",
          stroke: cssVar("--accent"),
          width: 1,
          points: { show: false },
        },
      ],
      hooks: {
        ready: [
          (u) => {
            u.over.addEventListener("click", () => {
              const idx = u.cursor.idx;
              if (idx != null && series.dayIndexByPoint[idx] !== undefined) {
                selectDay(series.dayIndexByPoint[idx]);
              }
            });
          },
        ],
      },
    };

    const plot = new uPlot(opts, [series.ts, series.soc, series.price], container);
    plotRef.current = plot;
    const onResize = () => plot.setSize({ width: container.clientWidth, height: 260 });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      plot.destroy();
      plotRef.current = null;
    };
  }, [series, selectDay]);

  if (!series) return null;

  const bestWorst = result ? bestWorstDays(result) : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Hourly explorer</h3>
        <span className="flex items-center gap-2 text-xs text-text-muted">
          drag to zoom · double-click to reset · click a point to open that day
          {bestWorst && (
            <>
              <button
                type="button"
                onClick={() => selectDay(bestWorst.best)}
                className="rounded-md border border-border px-2 py-0.5 transition-colors hover:border-accent hover:text-text"
              >
                open best day
              </button>
              <button
                type="button"
                onClick={() => selectDay(bestWorst.worst)}
                className="rounded-md border border-border px-2 py-0.5 transition-colors hover:border-accent hover:text-text"
              >
                worst day
              </button>
            </>
          )}
        </span>
      </div>
      <div ref={containerRef} className="mt-2" />
    </div>
  );
}
