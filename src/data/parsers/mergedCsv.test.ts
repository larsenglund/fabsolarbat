import { describe, expect, it } from "vitest";
import { parseMergedCsv, parseNaiveTimestamp } from "./mergedCsv";

describe("parseNaiveTimestamp", () => {
  it("parses wall-clock digits as naive-UTC ms", () => {
    expect(parseNaiveTimestamp("2024-01-01 00:00")).toBe(Date.UTC(2024, 0, 1, 0, 0));
    expect(parseNaiveTimestamp("2024-06-15 13:00:00")).toBe(Date.UTC(2024, 5, 15, 13, 0));
    expect(parseNaiveTimestamp("2024-06-15T13:00")).toBe(Date.UTC(2024, 5, 15, 13, 0));
  });

  it("rejects malformed timestamps", () => {
    expect(parseNaiveTimestamp("2024-1-1 0:00")).toBeNull();
    expect(parseNaiveTimestamp("15/06/2024 13:00")).toBeNull();
    expect(parseNaiveTimestamp("")).toBeNull();
  });
});

describe("parseMergedCsv", () => {
  const header = "datetime,excess_solar_kwh,consumption_kwh,price_sek_per_kwh";

  it("parses the canonical format", () => {
    const rows = parseMergedCsv(
      `${header}\n2024-01-01 00:00,0.0,3.61,0.31745707\n2024-01-01 01:00,0.5,1.77,-0.05\n`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      hour: 0,
      excessSolarKwh: 0,
      consumptionKwh: 3.61,
      priceSekPerKwh: 0.31745707,
    });
    expect(rows[1].priceSekPerKwh).toBe(-0.05);
    expect(rows[1].t - rows[0].t).toBe(3_600_000);
  });

  it("rejects wrong column counts, bad numbers and unordered timestamps", () => {
    expect(() => parseMergedCsv(`${header}\n2024-01-01 00:00,1,2\n`)).toThrow(/4 columns/);
    expect(() => parseMergedCsv(`${header}\n2024-01-01 00:00,x,2,3\n`)).toThrow(/could not parse/);
    expect(() =>
      parseMergedCsv(`${header}\n2024-01-01 01:00,1,2,3\n2024-01-01 00:00,1,2,3\n`),
    ).toThrow(/strictly increasing/);
    // Duplicates hit the same <= boundary.
    expect(() =>
      parseMergedCsv(`${header}\n2024-01-01 00:00,1,2,3\n2024-01-01 00:00,1,2,3\n`),
    ).toThrow(/strictly increasing/);
  });

  it("rejects empty numeric fields instead of reading them as 0", () => {
    expect(() => parseMergedCsv(`${header}\n2024-01-01 00:00,,2,3\n`)).toThrow(/could not parse/);
    expect(() => parseMergedCsv(`${header}\n2024-01-01 00:00,1,2,\n`)).toThrow(/could not parse/);
  });

  it("tolerates hour gaps (DST spring-forward)", () => {
    const rows = parseMergedCsv(`${header}\n2024-03-31 01:00,0,2,0.3\n2024-03-31 03:00,0,2,0.3\n`);
    expect(rows).toHaveLength(2);
  });
});
