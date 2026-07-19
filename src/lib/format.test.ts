import { describe, expect, it } from "vitest";
import { formatPercent, formatSek } from "./format";

describe("formatSek", () => {
  it("rounds to whole SEK and groups thousands", () => {
    expect(formatSek(8334.4)).toBe("8 334 kr");
    expect(formatSek(1234567)).toBe("1 234 567 kr");
  });

  it("handles zero and small values", () => {
    expect(formatSek(0)).toBe("0 kr");
    expect(formatSek(999.4)).toBe("999 kr");
  });

  it("uses a proper minus sign for negatives", () => {
    expect(formatSek(-1200.6)).toBe("−1 201 kr");
  });
});

describe("formatPercent", () => {
  it("uses comma decimals", () => {
    expect(formatPercent(21.34)).toBe("21,3 %");
    expect(formatPercent(5)).toBe("5,0 %");
  });

  it("respects the decimals argument and negative values", () => {
    expect(formatPercent(-8.276, 2)).toBe("−8,28 %");
    expect(formatPercent(100, 0)).toBe("100 %");
  });

  it("never renders a signed zero", () => {
    expect(formatPercent(-0.04)).toBe("0,0 %");
    expect(formatPercent(-0.05)).toBe("−0,1 %");
  });
});
