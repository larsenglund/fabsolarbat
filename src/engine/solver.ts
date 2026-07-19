import loadHighs from "highs";
// Vite rewrites this into the emitted-asset URL for highs.wasm (the package's
// exports map has "./runtime" → build/highs.wasm). Without it, a bundled page
// or worker 404s on the wasm fetch — the package's own resolution only works
// from its unbundled directory (or via fs in Node).
import wasmUrl from "highs/runtime?url";

export type Highs = Awaited<ReturnType<typeof loadHighs>>;

let instance: Promise<Highs> | undefined;

const isNode = typeof process !== "undefined" && !!process.versions?.node;

/**
 * Lazy singleton for the HiGHS WASM solver. In Node (tests) the package
 * resolves highs.wasm from its own directory; in a Vite-bundled page or
 * worker we hand the bundler-emitted asset URL to locateFile. A failed load
 * (e.g. flaky network fetching the wasm) is not cached, so the next call
 * retries.
 */
export function getSolver(): Promise<Highs> {
  instance ??= loadHighs(
    isNode ? undefined : { locateFile: (f) => (f.endsWith(".wasm") ? wasmUrl : f) },
  ).catch((err: unknown) => {
    instance = undefined;
    throw err;
  });
  return instance;
}
