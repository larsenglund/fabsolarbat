import { type ReactNode, useState } from "react";
import { type MergeReport, mergeEnergyAndPrices, reportForMerged } from "../data/merge";
import { parseEnergyCsv } from "../data/parsers/energyCsv";
import { fxLookup, parseFxCsv } from "../data/parsers/fxCsv";
import { parseMergedCsv } from "../data/parsers/mergedCsv";
import { type PriceUnit, parsePriceCsv, toSekPerKwh } from "../data/parsers/priceCsv";
import type { DatasetMeta } from "../data/sample";
import type { HourRecord } from "../engine/types";
import { useAppStore } from "../store/appStore";

/* ---------- Format examples (the contract, shown to the user) ---------- */

const MERGED_EXAMPLE = `datetime,excess_solar_kwh,consumption_kwh,price_sek_per_kwh
2024-01-01 00:00,0.0,3.61,0.317
2024-01-01 01:00,0.0,1.77,0.297
2024-01-01 02:00,0.0,2.44,0.273
...one row per hour, a full year is ideal`;

const MERGED_TEMPLATE = `datetime,excess_solar_kwh,consumption_kwh,price_sek_per_kwh
2024-01-01 00:00,0.0,3.61,0.317
2024-01-01 01:00,0.0,1.77,0.297
2024-01-01 02:00,0.0,2.44,0.273
`;

const ENERGY_EXAMPLE = `"Datum";"Produktion";"El kWh"
"2024-01-01 00:00";"0,000";"3,61"
"2024-01-01 01:00";"0,000";"1,77"
"2024-01-01 02:00";"0,000";"2,44"
...Swedish decimal commas and extra columns are fine`;

const ENERGY_TEMPLATE = `"Datum";"Produktion";"El kWh"
"2024-01-01 00:00";"0,000";"3,61"
"2024-01-01 01:00";"0,000";"1,77"
`;

const PRICE_EXAMPLE = `"MTU (UTC)","Area","Day-ahead Price (EUR/MWh)"
"01/01/2024 00:00:00 - 01/01/2024 01:00:00","BZN|SE3","28.46"
"01/01/2024 01:00:00 - 01/01/2024 02:00:00","BZN|SE3","26.66"

— or the simple shape —
datetime,price
2024-01-01 00:00,0.317
2024-01-01 01:00,0.297`;

const PRICE_TEMPLATE = `datetime,price
2024-01-01 00:00,0.317
2024-01-01 01:00,0.297
`;

const FX_EXAMPLE = `Date,EUR_to_SEK_Rate
2024-01-01,11.1545
2024-01-02,11.1545
...only needed when prices are in EUR/MWh`;

function download(filename: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function FormatCard({
  title,
  source,
  example,
  template,
  templateName,
}: {
  title: string;
  source: string;
  example: string;
  template?: string;
  templateName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {template && templateName && (
          <button
            type="button"
            onClick={() => download(templateName, template)}
            className="text-xs text-accent underline underline-offset-2"
          >
            download template
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-text-muted">{source}</p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-text-muted">
        {example}
      </pre>
    </div>
  );
}

/* ---------- Upload state & parsing ---------- */

type Mode = "merged" | "separate";

interface Parsed {
  hours: HourRecord[];
  report: MergeReport;
}

function metaFor(hours: HourRecord[], report: MergeReport): DatasetMeta {
  return {
    label: `Your data · ${report.coverageDays} d`,
    source: "user",
    hours: hours.length,
    firstDay: report.firstDay,
    lastDay: report.lastDay,
  };
}

export function UploadPage() {
  const setView = useAppStore((s) => s.setView);
  const applyUploadedDataset = useAppStore((s) => s.applyUploadedDataset);
  const persisted = useAppStore((s) => s.persisted);
  const continuePersisted = useAppStore((s) => s.continuePersisted);
  const clearUserData = useAppStore((s) => s.clearUserData);

  const [mode, setMode] = useState<Mode>("merged");
  const [energyFile, setEnergyFile] = useState<File | null>(null);
  const [priceFile, setPriceFile] = useState<File | null>(null);
  const [fxFile, setFxFile] = useState<File | null>(null);
  const [unit, setUnit] = useState<PriceUnit>("eur-mwh");
  const [unitDetected, setUnitDetected] = useState(false);
  const [fxRate, setFxRate] = useState(11.5);
  const [shiftUtc, setShiftUtc] = useState(true);
  const [utcDetected, setUtcDetected] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseMergedFile = async (file: File) => {
    setError(null);
    setParsed(null);
    try {
      const hours = parseMergedCsv(await file.text());
      if (hours.length < 72) throw new Error("At least 3 days of hourly data are needed");
      setParsed({ hours, report: reportForMerged(hours) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const parseSeparate = async (
    energy: File | null,
    price: File | null,
    fx: File | null,
    unitNow: PriceUnit,
    rateNow: number,
    shiftNow: boolean,
  ) => {
    setError(null);
    setParsed(null);
    if (!energy || !price) return;
    try {
      const e = parseEnergyCsv(await energy.text());
      const p = parsePriceCsv(await price.text());
      if (p.detectedUnit && !unitDetected) {
        setUnit(p.detectedUnit);
        setUnitDetected(true);
        unitNow = p.detectedUnit;
      }
      setUtcDetected(p.timestampsAreUtc);
      const rate = fx ? fxLookup(parseFxCsv(await fx.text())) : () => rateNow;
      const sek = toSekPerKwh(p.rows, unitNow, rate, p.timestampsAreUtc && shiftNow);
      const merged = mergeEnergyAndPrices(e.rows, sek, [...e.warnings, ...p.warnings]);
      setParsed(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const reparse = (over: {
    energy?: File | null;
    price?: File | null;
    fx?: File | null;
    unit?: PriceUnit;
    rate?: number;
    shift?: boolean;
  }) => {
    void parseSeparate(
      over.energy !== undefined ? over.energy : energyFile,
      over.price !== undefined ? over.price : priceFile,
      over.fx !== undefined ? over.fx : fxFile,
      over.unit ?? unit,
      over.rate ?? fxRate,
      over.shift ?? shiftUtc,
    );
  };

  return (
    <main className="flex-1 py-10">
      <button
        type="button"
        onClick={() => setView("landing")}
        className="mb-8 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-semibold tracking-tight">Use your own data</h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-text-muted">
        Files are parsed entirely in your browser and stored only on this device — nothing is
        uploaded anywhere. One row per hour; a full year gives the most trustworthy result.
      </p>

      {persisted && (
        <div className="mt-6 flex max-w-3xl flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <span className="text-text-muted">
            Stored on this device: <strong className="text-text">{persisted.meta.label}</strong> (
            {persisted.meta.firstDay} → {persisted.meta.lastDay})
          </span>
          <button
            type="button"
            onClick={continuePersisted}
            className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white"
          >
            Continue with it
          </button>
          <button
            type="button"
            onClick={() => void clearUserData()}
            className="rounded-lg border border-border px-3 py-1.5 text-text-muted hover:text-negative"
          >
            Remove my data
          </button>
        </div>
      )}

      <div className="mt-8 flex gap-2">
        <ModeButton active={mode === "merged"} onClick={() => setMode("merged")}>
          One merged file (recommended)
        </ModeButton>
        <ModeButton active={mode === "separate"} onClick={() => setMode("separate")}>
          Separate energy + price files
        </ModeButton>
      </div>

      {mode === "merged" ? (
        <div className="mt-6 grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
          <FormatCard
            title="Merged hourly file"
            source="Build it in any spreadsheet: timestamp, exported solar (kWh), grid consumption (kWh), spot price (SEK/kWh, before VAT). Save as CSV."
            example={MERGED_EXAMPLE}
            template={MERGED_TEMPLATE}
            templateName="fabsolarbat-template.csv"
          />
          <div className="flex flex-col gap-4">
            <FileInput
              id="merged-file"
              label="Merged CSV file"
              onFile={(f) => void parseMergedFile(f)}
            />
            <ReportPanel parsed={parsed} error={error} />
            <UseButton
              parsed={parsed}
              onUse={(p) => applyUploadedDataset(p.hours, metaFor(p.hours, p.report))}
            />
          </div>
        </div>
      ) : (
        <div className="mt-6 grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <FormatCard
              title="1 · Energy file"
              source="Export from your grid operator or energy portal (hourly consumption, and production/export if you have solar). Semicolons, decimal commas and extra columns are handled."
              example={ENERGY_EXAMPLE}
              template={ENERGY_TEMPLATE}
              templateName="fabsolarbat-energy-template.csv"
            />
            <FormatCard
              title="2 · Price file"
              source="Day-ahead prices for your bidding zone, e.g. an ENTSO-E transparency export, or a simple two-column file."
              example={PRICE_EXAMPLE}
              template={PRICE_TEMPLATE}
              templateName="fabsolarbat-price-template.csv"
            />
            <FormatCard
              title="3 · Exchange rates (optional)"
              source="Daily EUR→SEK rates, only needed when prices are in EUR/MWh. Without a file, the fixed rate below is used."
              example={FX_EXAMPLE}
            />
          </div>

          <div className="flex flex-col gap-4">
            <FileInput
              id="energy-file"
              label="Energy CSV file"
              onFile={(f) => {
                setEnergyFile(f);
                reparse({ energy: f });
              }}
            />
            <FileInput
              id="price-file"
              label="Price CSV file"
              onFile={(f) => {
                setPriceFile(f);
                reparse({ price: f });
              }}
            />
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <label htmlFor="price-unit" className="text-[13px] text-text-muted">
                Price unit {unitDetected && <em>(detected from the file)</em>}
              </label>
              <select
                id="price-unit"
                value={unit}
                onChange={(e) => {
                  const u = e.target.value as PriceUnit;
                  setUnit(u);
                  setUnitDetected(false);
                  reparse({ unit: u });
                }}
                className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              >
                <option value="eur-mwh">EUR per MWh (ENTSO-E)</option>
                <option value="sek-kwh">SEK per kWh</option>
                <option value="ore-kwh">öre per kWh</option>
              </select>

              {unit === "eur-mwh" && (
                <>
                  <label htmlFor="fx-rate" className="mt-3 block text-[13px] text-text-muted">
                    Fixed EUR→SEK rate (used when no rate file is given)
                  </label>
                  <input
                    id="fx-rate"
                    type="number"
                    step={0.01}
                    min={5}
                    max={20}
                    value={fxRate}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      if (Number.isFinite(r)) {
                        setFxRate(r);
                        reparse({ rate: r });
                      }
                    }}
                    className="mt-1 w-28 rounded-md border border-border bg-surface px-2 py-1 text-[13px] tabular-nums focus:border-accent focus:outline-none"
                  />
                  <div className="mt-2">
                    <FileInput
                      id="fx-file"
                      label="Daily rate CSV (optional)"
                      compact
                      onFile={(f) => {
                        setFxFile(f);
                        reparse({ fx: f });
                      }}
                    />
                  </div>
                </>
              )}

              {utcDetected && (
                <label className="mt-3 flex items-start gap-2 text-[13px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={shiftUtc}
                    onChange={(e) => {
                      setShiftUtc(e.target.checked);
                      reparse({ shift: e.target.checked });
                    }}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    Price timestamps are UTC — shift them to Swedish time (+1 h/+2 h). Keep this on
                    unless your energy file is also in UTC.
                  </span>
                </label>
              )}
            </div>
            <ReportPanel parsed={parsed} error={error} />
            <UseButton
              parsed={parsed}
              onUse={(p) => applyUploadedDataset(p.hours, metaFor(p.hours, p.report))}
            />
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------- Small pieces ---------- */

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
        active ? "border-accent bg-accent text-white" : "border-border bg-surface text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function FileInput({
  id,
  label,
  compact,
  onFile,
}: {
  id: string;
  label: string;
  compact?: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <div className={compact ? "" : "rounded-xl border border-border bg-surface p-4"}>
      <label htmlFor={id} className="text-[13px] text-text-muted">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
        className="mt-1 block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-text"
      />
    </div>
  );
}

function ReportPanel({ parsed, error }: { parsed: Parsed | null; error: string | null }) {
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-negative/40 bg-surface p-4 text-sm text-negative"
      >
        {error}
      </div>
    );
  }
  if (!parsed) return null;
  const r = parsed.report;
  return (
    <section
      className="rounded-xl border border-border bg-surface p-4 text-sm"
      aria-label="Validation report"
    >
      <h3 className="font-medium">Checked ✓</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-text-muted">
        <dt>Coverage</dt>
        <dd className="text-right tabular-nums">
          {r.firstDay} → {r.lastDay} ({r.coverageDays} days)
        </dd>
        <dt>Usable hours</dt>
        <dd className="text-right tabular-nums">{r.matchedHours.toLocaleString("sv-SE")}</dd>
        {r.energyWithoutPrice > 0 && (
          <>
            <dt>Energy hours without a price</dt>
            <dd className="text-right tabular-nums">{r.energyWithoutPrice}</dd>
          </>
        )}
        {r.gaps > 0 && (
          <>
            <dt>Missing hours in range</dt>
            <dd className="text-right tabular-nums">{r.gaps}</dd>
          </>
        )}
      </dl>
      {r.warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-[13px] text-text-muted">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UseButton({ parsed, onUse }: { parsed: Parsed | null; onUse: (p: Parsed) => void }) {
  return (
    <button
      type="button"
      disabled={!parsed}
      onClick={() => parsed && onUse(parsed)}
      className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      Analyze this dataset
    </button>
  );
}
