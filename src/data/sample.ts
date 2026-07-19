// Vite emits the CSV as a hashed asset and hands us its URL — the committed
// dataset in data/ stays the single source of truth (also used by the tests).
import sampleCsvUrl from "../../data/merged_hourly_data.csv?url";
import type { HourRecord } from "../engine/types";
import { parseMergedCsv } from "./parsers/mergedCsv";

export interface DatasetMeta {
  label: string;
  source: "sample" | "user";
  hours: number;
  firstDay: string;
  lastDay: string;
}

export async function loadSampleDataset(): Promise<{ hours: HourRecord[]; meta: DatasetMeta }> {
  const response = await fetch(sampleCsvUrl);
  if (!response.ok) throw new Error(`Failed to fetch sample dataset (HTTP ${response.status})`);
  const hours = parseMergedCsv(await response.text());
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
  return {
    hours,
    meta: {
      label: "2024 sample · SE3",
      source: "sample",
      hours: hours.length,
      firstDay: fmt(hours[0].t),
      lastDay: fmt(hours[hours.length - 1].t),
    },
  };
}
