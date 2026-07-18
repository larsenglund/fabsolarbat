import { describe, expect, it } from "vitest";
import { socBounds } from "../src/engine/battery";
import { getSolver } from "../src/engine/solver";
import { DEFAULT_PARAMS } from "../src/engine/types";
import { runWindow } from "../src/engine/window";

describe("audit: overcharge clamp with carried SoC above degraded ceiling", () => {
  it("can emit negative solarToBattery", async () => {
    const highs = await getSolver();
    const params = DEFAULT_PARAMS;
    const cycles = 100; // maxSoc shrinks to 13.7519
    const b = socBounds(cycles, params.battery);
    const initialSoc = 13.82; // yesterday's full charge at 0 cycles
    expect(initialSoc).toBeGreaterThan(b.maxSoc);

    const rows = [0, 1].map((i) => ({
      t: i * 3_600_000,
      hour: 13 + i,
      day: 0,
      consumptionKwh: 0.001,
      excessSolarKwh: 0,
      priceSekPerKwh: 1.0,
    }));

    const { hourly, summary } = runWindow(highs, {
      rows,
      planningSolarKwh: [0, 0],
      initialSoc,
      cyclesCompleted: cycles,
      params,
      usesEstimates: true,
    });

    console.log("maxSoc:", b.maxSoc, "initialSoc:", initialSoc);
    console.log("hour0:", JSON.stringify(hourly[0]));
    console.log("hour1:", JSON.stringify(hourly[1]));
    console.log("totalSolarToBattery:", summary.totalSolarToBattery);
  });
});
