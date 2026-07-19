import { create } from "zustand";
import { type DatasetMeta, loadSampleDataset } from "../data/sample";
import { DEFAULT_FINANCE, type FinanceParams } from "../engine/finance";
import {
  type AnnualResult,
  DEFAULT_PARAMS,
  type EngineParams,
  type HourRecord,
} from "../engine/types";
import { startRun } from "../sim/simClient";

export interface AppState {
  view: "landing" | "analysis" | "about";
  dataset: HourRecord[] | null;
  datasetMeta: DatasetMeta | null;
  params: EngineParams;
  finance: FinanceParams;
  /** Last completed result (may be stale while a new run is in flight). */
  result: AnnualResult | null;
  /** Non-null while a simulation is running: progress fraction 0..1. */
  progress: number | null;
  error: string | null;
  /** Day index (into result.days) open in the drill-down, or null. */
  selectedDay: number | null;

  setView: (view: AppState["view"]) => void;
  exploreSample: () => Promise<void>;
  setParams: (patch: DeepPartial<EngineParams>) => void;
  setFinance: (patch: Partial<FinanceParams>) => void;
  resetParams: () => void;
  selectDay: (index: number | null) => void;
}

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

const DEBOUNCE_MS = 300;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function mergeParams(base: EngineParams, patch: DeepPartial<EngineParams>): EngineParams {
  return {
    battery: { ...base.battery, ...patch.battery },
    tariff: { ...base.tariff, ...patch.tariff },
    strategy: { ...base.strategy, ...patch.strategy },
  };
}

export const useAppStore = create<AppState>((set, get) => {
  const scheduleRun = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const { dataset, params } = get();
      if (!dataset) return;
      set({ progress: 0, error: null });
      startRun(dataset, params, {
        onProgress: (day, totalDays) => set({ progress: day / totalDays }),
        onDone: (result) => set({ result, progress: null }),
        onError: (message) => set({ error: message, progress: null }),
      });
    }, DEBOUNCE_MS);
  };

  return {
    view: "landing",
    dataset: null,
    datasetMeta: null,
    params: DEFAULT_PARAMS,
    finance: DEFAULT_FINANCE,
    result: null,
    progress: null,
    error: null,
    selectedDay: null,

    setView: (view) => set({ view }),

    exploreSample: async () => {
      set({ view: "analysis", error: null });
      if (get().dataset) return;
      try {
        const { hours, meta } = await loadSampleDataset();
        set({ dataset: hours, datasetMeta: meta });
        scheduleRun();
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      }
    },

    setParams: (patch) => {
      set((s) => ({ params: mergeParams(s.params, patch) }));
      scheduleRun();
    },

    setFinance: (patch) => set((s) => ({ finance: { ...s.finance, ...patch } })),

    resetParams: () => {
      set({ params: DEFAULT_PARAMS, finance: DEFAULT_FINANCE });
      scheduleRun();
    },

    selectDay: (index) => set({ selectedDay: index }),
  };
});
