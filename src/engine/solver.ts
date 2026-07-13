import loadHighs from "highs";

export type Highs = Awaited<ReturnType<typeof loadHighs>>;

let instance: Promise<Highs> | undefined;

/**
 * Lazy singleton for the HiGHS WASM solver. Works in Node (tests) and in a
 * Web Worker (the app). The wasm binary is only fetched/instantiated once.
 */
export function getSolver(): Promise<Highs> {
  instance ??= loadHighs();
  return instance;
}
