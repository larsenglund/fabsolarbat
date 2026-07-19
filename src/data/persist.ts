import { del, get, set } from "idb-keyval";
import type { HourRecord } from "../engine/types";
import type { DatasetMeta } from "./sample";

/**
 * Local-only persistence of the user's parsed dataset (IndexedDB). Nothing
 * ever leaves the browser; an explicit remove control clears it.
 */
const KEY = "fabsolarbat-dataset-v1";

export interface PersistedDataset {
  hours: HourRecord[];
  meta: DatasetMeta;
  savedAt: number;
}

export async function saveDataset(d: PersistedDataset): Promise<void> {
  try {
    await set(KEY, d);
  } catch {
    // Private-browsing modes can reject IndexedDB — persistence is best-effort.
  }
}

export async function loadDataset(): Promise<PersistedDataset | undefined> {
  try {
    const d = await get<PersistedDataset>(KEY);
    if (d && Array.isArray(d.hours) && d.hours.length > 0 && d.meta) return d;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function removeDataset(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    // Nothing to do — worst case the key was never stored.
  }
}
