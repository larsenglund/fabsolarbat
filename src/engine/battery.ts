import type { BatteryParams } from "./types";

/**
 * Linear capacity degradation with accumulated cycles: 100% → eolCapacityPercent
 * over cyclesToEol cycles, clamped at EOL. (The finance projection continues
 * degrading past EOL; within-year simulation clamps, matching Python.)
 */
export function capacityFactor(cyclesCompleted: number, battery: BatteryParams): number {
  const eol = battery.eolCapacityPercent / 100;
  if (cyclesCompleted >= battery.cyclesToEol) return eol;
  return 1 - (1 - eol) * (cyclesCompleted / battery.cyclesToEol);
}

export interface SocBounds {
  minSoc: number;
  maxSoc: number;
  effectiveCapacityKwh: number;
  capacityFactor: number;
}

export function socBounds(cyclesCompleted: number, battery: BatteryParams): SocBounds {
  const cf = capacityFactor(cyclesCompleted, battery);
  const effective = battery.usableCapacityKwh * cf;
  return {
    minSoc: effective * (1 - battery.depthOfDischargePercent / 100),
    maxSoc: effective * (battery.maxChargePercent / 100),
    effectiveCapacityKwh: effective,
    capacityFactor: cf,
  };
}
