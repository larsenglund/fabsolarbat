import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE } from "../src/engine/finance";
import { DEFAULT_PARAMS } from "../src/engine/types";
import { decodeScenario, encodeScenario } from "../src/urlState";

describe("URL scenario codec", () => {
  it("default scenario encodes to an empty query string", () => {
    expect(encodeScenario(DEFAULT_PARAMS, DEFAULT_FINANCE)).toBe("");
  });

  it("decoding an empty string yields the defaults", () => {
    const d = decodeScenario("");
    expect(d.params).toEqual(DEFAULT_PARAMS);
    expect(d.finance).toEqual(DEFAULT_FINANCE);
    expect(d.hasScenario).toBe(false);
    expect(d.openSample).toBe(false);
  });

  it("round-trips every parameter (all set to non-default values)", () => {
    const params = structuredClone(DEFAULT_PARAMS);
    params.battery = {
      usableCapacityKwh: 20,
      maxPowerKw: 5,
      acEfficiency: 0.9,
      maxChargePercent: 95,
      depthOfDischargePercent: 80,
      cyclesToEol: 8000,
      eolCapacityPercent: 60,
    };
    params.tariff = {
      vatMultiplier: 1.2,
      transferFeeSekPerKwh: 0.5,
      fixedMarkupSekPerKwh: 0.06,
      sellBonusSekPerKwh: 0.08,
    };
    params.strategy = {
      model: "sell-at-spot",
      planningHour: 12,
      windowHours: 36,
      solarForecast: "weighted",
      gridChargePenaltySekPerKwh: 0.002,
    };
    const finance = {
      systemCostSek: 60_000,
      horizonYears: 15,
      discountRate: 0.05,
      alternativeReturnRate: 0.07,
    };

    const qs = encodeScenario(params, finance);
    const d = decodeScenario(qs);
    expect(d.params).toEqual(params);
    expect(d.finance).toEqual(finance);
    expect(d.hasScenario).toBe(true);
  });

  it("encodes only non-default values", () => {
    const params = structuredClone(DEFAULT_PARAMS);
    params.battery.usableCapacityKwh = 20;
    const qs = encodeScenario(params, DEFAULT_FINANCE);
    expect(qs).toBe("cap=20");
  });

  it("round-trips the null (plan-on-actuals) forecast as 'actual'", () => {
    const params = structuredClone(DEFAULT_PARAMS);
    params.strategy.solarForecast = null;
    const qs = encodeScenario(params, DEFAULT_FINANCE);
    expect(qs).toContain("fc=actual");
    expect(decodeScenario(qs).params.strategy.solarForecast).toBeNull();
  });

  it("accepts a leading question mark", () => {
    const d = decodeScenario("?cap=20&mdl=sell");
    expect(d.params.battery.usableCapacityKwh).toBe(20);
    expect(d.params.strategy.model).toBe("sell-at-spot");
  });

  it("carries the d=sample flag", () => {
    expect(decodeScenario("d=sample").openSample).toBe(true);
    const qs = encodeScenario(DEFAULT_PARAMS, DEFAULT_FINANCE, true);
    expect(qs).toBe("d=sample");
  });

  it("ignores unknown keys, malformed numbers and out-of-range values", () => {
    const d = decodeScenario("nope=1&cap=banana&pow=-5&eff=2&vat=1.1");
    expect(d.params.battery.usableCapacityKwh).toBe(DEFAULT_PARAMS.battery.usableCapacityKwh);
    expect(d.params.battery.maxPowerKw).toBe(DEFAULT_PARAMS.battery.maxPowerKw);
    expect(d.params.battery.acEfficiency).toBe(DEFAULT_PARAMS.battery.acEfficiency);
    expect(d.params.tariff.vatMultiplier).toBe(1.1); // the one valid key applies
    expect(d.hasScenario).toBe(true);
  });

  it("ignores invalid enum codes", () => {
    const d = decodeScenario("mdl=burn&fc=astrology");
    expect(d.params.strategy.model).toBe(DEFAULT_PARAMS.strategy.model);
    expect(d.params.strategy.solarForecast).toBe(DEFAULT_PARAMS.strategy.solarForecast);
    expect(d.hasScenario).toBe(false);
  });

  it("trims float noise from UI step arithmetic", () => {
    const params = structuredClone(DEFAULT_PARAMS);
    params.tariff.transferFeeSekPerKwh = 0.07500000000000001;
    const qs = encodeScenario(params, DEFAULT_FINANCE);
    expect(qs).toBe("fee=0.075");
    expect(decodeScenario(qs).params.tariff.transferFeeSekPerKwh).toBe(0.075);
  });
});
