import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { parseMergedCsv } from "../src/data/parsers/mergedCsv";
import { buildForecastIndex, estimateSolar } from "../src/engine/solarForecast";
import { getSolver } from "../src/engine/solver";
import { DEFAULT_PARAMS } from "../src/engine/types";
import { runWindow } from "../src/engine/window";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

describe("audit: annual run diagnostics (hourly resolution)", () => {
  it("scans hourly flows for negatives", { timeout: 600_000 }, async () => {
    const hours = parseMergedCsv(
      readFileSync(join(process.cwd(), "data", "merged_hourly_data.csv"), "utf8"),
    );
    const highs = await getSolver();
    const params = DEFAULT_PARAMS;
    const { windowHours, planningHour, solarForecast } = params.strategy;

    const indexByTime = new Map<number, number>();
    for (let i = 0; i < hours.length; i++) {
      if (!indexByTime.has(hours[i].t)) indexByTime.set(hours[i].t, i);
    }
    const forecastIndex = buildForecastIndex(hours);
    const firstOpt = hours.find((r) => r.hour === planningHour);
    if (!firstOpt) throw new Error("no planning hour");
    const lastOptTime = hours[hours.length - 1].t - windowHours * HOUR_MS;

    let currentSoc = 0;
    let totalCycles = 0;
    let negS2bHours = 0;
    let minS2b = 0;
    let negG2bHours = 0;
    let minG2b = 0;
    let daysAboveCeiling = 0;
    let maxExcess = 0;
    let days = 0;
    const t0 = performance.now();

    for (let time = firstOpt.t; time <= lastOptTime; time += DAY_MS) {
      const startIdx = indexByTime.get(time);
      if (startIdx === undefined) continue;
      if (startIdx + windowHours > hours.length) break;
      const rows = hours.slice(startIdx, startIdx + windowHours);
      const planningSolar = estimateSolar(forecastIndex, startIdx, windowHours, solarForecast!);

      const { hourly, summary } = runWindow(highs, {
        rows,
        planningSolarKwh: planningSolar,
        initialSoc: currentSoc,
        cyclesCompleted: totalCycles,
        params,
        usesEstimates: true,
      });
      days++;

      // was carried SoC above this day's ceiling?
      if (
        currentSoc >
        summary.effectiveCapacityKwh * (params.battery.maxChargePercent / 100) + 1e-12
      ) {
        daysAboveCeiling++;
        maxExcess = Math.max(
          maxExcess,
          currentSoc - summary.effectiveCapacityKwh * (params.battery.maxChargePercent / 100),
        );
      }
      for (const h of hourly) {
        if (h.solarToBattery < 0) {
          negS2bHours++;
          if (h.solarToBattery < minS2b) minS2b = h.solarToBattery;
        }
        if (h.gridToBattery < 0) {
          negG2bHours++;
          if (h.gridToBattery < minG2b) minG2b = h.gridToBattery;
        }
      }

      totalCycles += summary.totalBatteryToHome / params.battery.usableCapacityKwh;
      currentSoc = hourly.length >= 24 ? hourly[23].soc : summary.finalSoc;
    }
    const t1 = performance.now();
    console.log(
      JSON.stringify(
        {
          runtimeMs: Math.round(t1 - t0),
          days,
          negS2bHours,
          minHourS2b: minS2b,
          negG2bHours,
          minHourG2b: minG2b,
          daysInitialSocAboveCeiling: daysAboveCeiling,
          maxSocExcessOverCeiling: maxExcess,
          totalCycles,
        },
        null,
        1,
      ),
    );
  });
});
