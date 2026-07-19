import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeEnergyAndPrices } from "../src/data/merge";
import { parseEnergyCsv } from "../src/data/parsers/energyCsv";
import { fxLookup, parseFxCsv } from "../src/data/parsers/fxCsv";
import { parseMergedCsv } from "../src/data/parsers/mergedCsv";
import { parsePriceCsv, toSekPerKwh } from "../src/data/parsers/priceCsv";

const fixture = (name: string) => readFileSync(join(process.cwd(), "data", name), "utf8");

describe("energy CSV parser (grid-operator export fixture)", () => {
  it("parses the real Swedish-locale export", () => {
    const { rows, hasProduction, warnings } = parseEnergyCsv(
      fixture("hourly_production_and_consumption.csv"),
    );
    expect(hasProduction).toBe(true);
    expect(rows.length).toBeGreaterThan(8700);
    expect(rows[0].consumptionKwh).toBeCloseTo(3.61, 9);
    expect(rows[0].productionKwh).toBeCloseTo(0, 9);
    // Real export has no unit-scale problems.
    expect(warnings.join(" ")).not.toMatch(/watts/);
  });

  it("rejects files without a recognizable consumption column", () => {
    expect(() => parseEnergyCsv("a;b\n1;2\n")).toThrow(/could not identify/);
  });

  it("handles consumption-only files and empty values", () => {
    const r = parseEnergyCsv('"Datum";"El kWh"\n"2024-01-01 00:00";"1,5"\n"2024-01-01 01:00";""\n');
    expect(r.hasProduction).toBe(false);
    expect(r.rows[1].consumptionKwh).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/empty values/);
    expect(r.warnings.join(" ")).toMatch(/solar is assumed/);
  });
});

describe("price CSV parser (ENTSO-E fixture)", () => {
  it("parses the real export and detects EUR/MWh + UTC", () => {
    const { rows, detectedUnit, timestampsAreUtc } = parsePriceCsv(
      fixture("hourly_power_price.csv"),
    );
    expect(detectedUnit).toBe("eur-mwh");
    expect(timestampsAreUtc).toBe(true);
    expect(rows.length).toBeGreaterThan(8700);
    expect(rows[0].value).toBeCloseTo(28.46, 9);
  });

  it("accepts the simple datetime,price shape", () => {
    const r = parsePriceCsv("datetime,price\n2024-01-01 00:00,0.32\n2024-01-01 01:00,0.29\n");
    expect(r.detectedUnit).toBeNull();
    expect(r.rows).toHaveLength(2);
  });

  it("converts öre and EUR/MWh to SEK/kWh", () => {
    const rows = [{ t: 0, value: 50 }];
    expect(toSekPerKwh(rows, "ore-kwh", () => 0, false)[0].value).toBeCloseTo(0.5, 12);
    expect(toSekPerKwh(rows, "eur-mwh", () => 11.5, false)[0].value).toBeCloseTo(0.575, 12);
  });
});

describe("fixture equivalence: energy + prices + daily FX reproduce the canonical dataset", () => {
  it("matches data/merged_hourly_data.csv", () => {
    const energy = parseEnergyCsv(fixture("hourly_production_and_consumption.csv"));
    const price = parsePriceCsv(fixture("hourly_power_price.csv"));
    const fx = fxLookup(parseFxCsv(fixture("eur_to_sek_2024.csv")));
    // The canonical dataset was merged WITHOUT shifting the UTC price
    // timestamps (a quirk of the original analysis) — reproduce that here.
    const sek = toSekPerKwh(price.rows, "eur-mwh", fx, false);
    const { hours, report } = mergeEnergyAndPrices(energy.rows, sek);

    const canonical = parseMergedCsv(fixture("merged_hourly_data.csv"));
    expect(hours.length).toBe(canonical.length);
    for (let i = 0; i < canonical.length; i += 97) {
      expect(hours[i].t).toBe(canonical[i].t);
      expect(hours[i].consumptionKwh).toBeCloseTo(canonical[i].consumptionKwh, 9);
      expect(hours[i].excessSolarKwh).toBeCloseTo(canonical[i].excessSolarKwh, 9);
      expect(hours[i].priceSekPerKwh).toBeCloseTo(canonical[i].priceSekPerKwh, 6);
    }
    expect(report.coverageDays).toBeGreaterThan(360);
    expect(report.gaps).toBeLessThan(3);
  });

  it("UTC shift moves prices by one hour in winter", () => {
    const price = parsePriceCsv(fixture("hourly_power_price.csv"));
    const shifted = toSekPerKwh(price.rows, "eur-mwh", () => 11.5, true);
    expect(shifted[0].t - price.rows[0].t).toBe(3_600_000);
  });
});

describe("merge validation", () => {
  it("rejects disjoint files with a readable error", () => {
    const energy = [{ t: 0, consumptionKwh: 1, productionKwh: 0 }];
    const prices = [{ t: 999_999_999, value: 0.5 }];
    expect(() => mergeEnergyAndPrices(energy, prices)).toThrow(/at least 3 days/);
  });
});
