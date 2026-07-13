import type { TariffParams } from "./types";

/**
 * Full purchase price per kWh: spot with VAT, plus transfer fee and retailer
 * markup (both already incl. VAT). Mirrors the Python model:
 * price * 1.25 + 0.685.
 */
export function fullPricePerKwh(spotSekPerKwh: number, tariff: TariffParams): number {
  return (
    spotSekPerKwh * tariff.vatMultiplier + tariff.transferFeeSekPerKwh + tariff.fixedMarkupSekPerKwh
  );
}
