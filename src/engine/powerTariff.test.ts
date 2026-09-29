import { describe, expect, it } from "vitest";
import { easterSunday, isSwedishPublicHoliday } from "./holidays";
import { solveWindow } from "./lp";
import { monthlyPowerFees, PeakTracker, POWER_TARIFFS, type PowerTariffDef } from "./powerTariff";
import { getSolver } from "./solver";

const at = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h);
const fev = POWER_TARIFFS["fev-2025"];

describe("Swedish public holidays", () => {
  it("computes Easter Sunday", () => {
    expect(easterSunday(2019)).toBe(at(2019, 4, 21));
    expect(easterSunday(2024)).toBe(at(2024, 3, 31));
    expect(easterSunday(2025)).toBe(at(2025, 4, 20));
    expect(easterSunday(2026)).toBe(at(2026, 4, 5));
  });

  it("knows the fixed and moving röda dagar", () => {
    expect(isSwedishPublicHoliday(at(2024, 1, 1, 10))).toBe(true);
    expect(isSwedishPublicHoliday(at(2024, 1, 6, 10))).toBe(true);
    expect(isSwedishPublicHoliday(at(2024, 3, 29, 10))).toBe(true); // långfredagen
    expect(isSwedishPublicHoliday(at(2024, 4, 1, 10))).toBe(true); // annandag påsk
    expect(isSwedishPublicHoliday(at(2024, 5, 9, 10))).toBe(true); // Kristi himmelsfärd
    expect(isSwedishPublicHoliday(at(2024, 6, 22, 10))).toBe(true); // midsommardagen
    expect(isSwedishPublicHoliday(at(2024, 11, 2, 10))).toBe(true); // alla helgons dag
    expect(isSwedishPublicHoliday(at(2024, 12, 26, 10))).toBe(true);
    expect(isSwedishPublicHoliday(at(2024, 3, 28, 10))).toBe(false);
    expect(isSwedishPublicHoliday(at(2024, 12, 24, 10))).toBe(false); // julafton isn't a röd dag
  });
});

describe("Falu Energi & Vatten effektavgift", () => {
  it("measures weekdays 07–19, November–March, except holidays and the eves", () => {
    const w = fev.hourWeight;
    expect(w(at(2024, 1, 10, 7))).toBe(1); // Wednesday 07–08
    expect(w(at(2024, 1, 10, 18))).toBe(1); // 18–19
    expect(w(at(2024, 1, 10, 6))).toBe(0);
    expect(w(at(2024, 1, 10, 19))).toBe(0);
    expect(w(at(2024, 1, 13, 12))).toBe(0); // Saturday
    expect(w(at(2024, 1, 14, 12))).toBe(0); // Sunday
    expect(w(at(2024, 3, 29, 12))).toBe(0); // Good Friday
    expect(w(at(2024, 4, 10, 12))).toBe(0); // April: no fee
    expect(w(at(2024, 10, 30, 12))).toBe(0); // October: no fee
    expect(w(at(2024, 11, 1, 12))).toBe(1); // Friday 1 November
    expect(w(at(2024, 12, 23, 12))).toBe(1);
    expect(w(at(2024, 12, 24, 12))).toBe(0); // julafton
    expect(w(at(2024, 12, 31, 12))).toBe(0); // nyårsafton
    expect(fev.priceSekPerKwByMonth).toEqual([75, 75, 75, 0, 0, 0, 0, 0, 0, 0, 75, 75]);
  });

  it("bills the mean of the three highest hours on different days", () => {
    // FEV's own example: peaks of 5, 7 and 6 kW → 6 kW × 75 kr = 450 kr.
    const times = [
      at(2024, 1, 8, 9), // Mon 5 kW
      at(2024, 1, 8, 10), // Mon 4.9 kW — same day, can't be a second peak
      at(2024, 1, 9, 17), // Tue 7 kW
      at(2024, 1, 10, 8), // Wed 6 kW
      at(2024, 1, 11, 20), // Thu 20:00 — not measured
      at(2024, 1, 13, 12), // Saturday — not measured
      at(2024, 4, 3, 12), // April — free
    ];
    const kwh = [5, 4.9, 7, 6, 12, 12, 12];
    const fees = monthlyPowerFees(fev, times, kwh);
    expect(fees.map((f) => f.monthKey % 12)).toEqual([0, 3]);
    expect(fees[0].billedKw).toBeCloseTo(6, 12);
    expect(fees[0].feeSek).toBeCloseTo(450, 9);
    expect(fees[0].peaks.map((p) => p.kw)).toEqual([7, 6, 5]);
    expect(fees[1].feeSek).toBe(0);
  });

  it("counts missing peaks as zero and weights hours", () => {
    const halfNights: PowerTariffDef = {
      ...fev,
      onePeakPerDay: false,
      hourWeight: (t) => (new Date(t).getUTCHours() < 6 ? 0.5 : 1),
    };
    const fees = monthlyPowerFees(halfNights, [at(2024, 1, 8, 2), at(2024, 1, 8, 3)], [8, 2]);
    // Two samples (4 kW and 1 kW after weighting), three peaks averaged.
    expect(fees[0].billedKw).toBeCloseTo(5 / 3, 12);
  });
});

describe("PeakTracker", () => {
  it("hands the LP the month's executed peaks and today's floor", () => {
    const tracker = new PeakTracker(fev);
    tracker.record(at(2024, 1, 8, 10), 5); // Mon
    tracker.record(at(2024, 1, 9, 10), 3); // Tue
    tracker.record(at(2024, 1, 9, 11), 4); // Tue, higher
    tracker.record(at(2024, 1, 10, 9), 2.5); // Wed morning (window day)
    tracker.record(at(2024, 1, 10, 20), 9); // Wed evening — not measured
    // Window from Wed 13:00 for 13 h: Wed 13–18 measured, then evening/night.
    const times = Array.from({ length: 13 }, (_, i) => at(2024, 1, 10, 13 + i));
    const input = tracker.windowInput(times);
    expect(input.months).toHaveLength(1);
    expect(input.months[0].priceSekPerKw).toBe(75);
    expect(input.months[0].history).toEqual([5, 4]); // Wed excluded: it's in the window
    expect(input.groups).toEqual([{ month: 0, floorKw: 2.5 }]);
    expect(input.hourGroup).toEqual([0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1]);
  });
});

describe("peak-aware LP", () => {
  it("levels a measured spike exactly as far as the stored energy allows", async () => {
    const highs = await getSolver();
    // Wed 10 Jan 2024 13:00, 35 h, flat price: arbitrage can't pay, only the
    // peak fee can. A 6 kWh spike at 17:00; the battery starts at its floor,
    // so the energy must be bought in the measured hours 13–16 before it.
    const times = Array.from({ length: 35 }, (_, i) => at(2024, 1, 10, 13) + i * 3_600_000);
    const consumption = times.map((t) => (t === at(2024, 1, 10, 17) ? 6 : 1));
    const base = {
      fullPrice: times.map(() => 1),
      sellPrice: times.map(() => 0),
      consumptionKwh: consumption,
      planningSolarKwh: times.map(() => 0),
      initialSoc: 1.382,
      minSoc: 1.382,
      maxSoc: 13.82,
      maxPowerKw: 7.68,
      efficiency: 0.95,
      gridChargePenalty: 0.001,
    };
    const draw = (plan: ReturnType<typeof solveWindow>, i: number) =>
      consumption[i] - plan.batteryToHome[i] + plan.gridToBattery[i];

    // Without the fee the battery idles through the spike.
    const idle = solveWindow(highs, base);
    expect(draw(idle, 4)).toBeCloseTo(6, 6);

    // With it, draw in 13–17 levels at L where 4·(L−1)·η = (6−L)/η.
    const peak = new PeakTracker(fev).windowInput(times);
    const plan = solveWindow(highs, { ...base, peak });
    const eta2 = 0.95 * 0.95;
    const level = (6 + 4 * eta2) / (1 + 4 * eta2);
    const wedMax = Math.max(...[0, 1, 2, 3, 4, 5].map((i) => draw(plan, i)));
    expect(wedMax).toBeCloseTo(level, 4);
  });
});
