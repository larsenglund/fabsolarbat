import loadHighs from "highs";

export type Highs = Awaited<ReturnType<typeof loadHighs>>;

let instance: Promise<Highs> | undefined;

/**
 * Lazy singleton for the HiGHS WASM solver. Works in Node (tests) and in a
 * Web Worker (the app). The wasm binary is only fetched/instantiated once;
 * a failed load (e.g. flaky network fetching the wasm) is not cached, so the
 * next call retries.
 */
export function getSolver(): Promise<Highs> {
  instance ??= loadHighs().catch((err: unknown) => {
    instance = undefined;
    throw err;
  });
  return instance;
}
