import { create } from "zustand";
import { loadDataset, type PersistedDataset, removeDataset, saveDataset } from "../data/persist";
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
  view: "landing" | "analysis" | "about" | "upload";
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
  /** Previously uploaded dataset restored from IndexedDB, if any. */
  persisted: PersistedDataset | null;
  /**
   * Pinned A/B baseline: a frozen result + the exact scenario that produced
   * it. Cleared whenever the dataset changes (cross-dataset deltas would be
   * meaningless).
   */
  baseline: PinnedBaseline | null;

  setView: (view: AppState["view"]) => void;
  initPersisted: () => Promise<void>;
  exploreSample: () => Promise<void>;
  applyUploadedDataset: (hours: HourRecord[], meta: DatasetMeta) => void;
  continuePersisted: () => void;
  clearUserData: () => Promise<void>;
  setParams: (patch: DeepPartial<EngineParams>) => void;
  setFinance: (patch: Partial<FinanceParams>) => void;
  resetParams: () => void;
  selectDay: (index: number | null) => void;
  pinBaseline: () => void;
  clearBaseline: () => void;
}

export interface PinnedBaseline {
  result: AnnualResult;
  params: EngineParams;
  finance: FinanceParams;
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
    persisted: null,
    baseline: null,

    setView: (view) => set({ view }),

    initPersisted: async () => {
      const d = await loadDataset();
      if (d) set({ persisted: d });
    },

    exploreSample: async () => {
      set({ view: "analysis", error: null });
      if (get().datasetMeta?.source === "sample") return;
      try {
        const { hours, meta } = await loadSampleDataset();
        set({ dataset: hours, datasetMeta: meta, result: null, selectedDay: null, baseline: null });
        scheduleRun();
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      }
    },

    applyUploadedDataset: (hours, meta) => {
      set({
        dataset: hours,
        datasetMeta: meta,
        view: "analysis",
        error: null,
        result: null,
        selectedDay: null,
        baseline: null,
      });
      const persisted: PersistedDataset = { hours, meta, savedAt: Date.now() };
      set({ persisted });
      void saveDataset(persisted);
      scheduleRun();
    },

    continuePersisted: () => {
      const d = get().persisted;
      if (!d) return;
      set({
        dataset: d.hours,
        datasetMeta: d.meta,
        view: "analysis",
        error: null,
        result: null,
        selectedDay: null,
        baseline: null,
      });
      scheduleRun();
    },

    clearUserData: async () => {
      await removeDataset();
      const wasUserData = get().datasetMeta?.source === "user";
      set({ persisted: null });
      if (wasUserData) {
        set({ dataset: null, datasetMeta: null, result: null, view: "landing", baseline: null });
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

    pinBaseline: () => {
      const { result, params, finance, progress } = get();
      if (!result || progress !== null) return;
      set({ baseline: { result, params, finance } });
    },

    clearBaseline: () => set({ baseline: null }),
  };
});
