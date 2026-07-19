import { formatPercent, formatSek } from "../lib/format";
import { useAppStore } from "../store/appStore";

/*
 * Headline numbers from the 2024 reference dataset, computed by this repo's
 * engine with executed-hours accounting (docs/PRIOR_WORK.md § Corrections —
 * the original analysis's 8,334 SEK / 3.6-7.2 yr figures double-counted
 * overlapping planning windows). No-sell model; payback range covers
 * 40-75 kSEK system cost. Pinned by the golden test.
 */
const REFERENCE = {
  annualSavings: 3967,
  costReduction: 15.8,
  payback: "11–24 yr",
};

export function Landing() {
  const exploreSample = useAppStore((s) => s.exploreSample);
  const setView = useAppStore((s) => s.setView);
  const persisted = useAppStore((s) => s.persisted);
  const continuePersisted = useAppStore((s) => s.continuePersisted);

  return (
    <main className="flex flex-1 flex-col justify-center gap-10 py-16">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          Would a home battery pay off?
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-muted">
          Find out with your own hourly consumption, solar and spot-price data — simulated against
          an optimal day-ahead charging strategy, not vendor napkin math. Everything runs in your
          browser; your data never leaves your machine.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void exploreSample()}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
        >
          Explore sample data
        </button>
        <button
          type="button"
          onClick={() => setView("upload")}
          className="rounded-lg border border-border bg-surface px-5 py-2.5 font-medium transition-colors hover:border-accent"
        >
          Upload your data
        </button>
        {persisted && (
          <button
            type="button"
            onClick={continuePersisted}
            className="rounded-lg border border-border bg-surface px-5 py-2.5 font-medium transition-colors hover:border-accent"
          >
            Continue with your data ({persisted.meta.firstDay.slice(0, 4)},{" "}
            {Math.round(persisted.meta.hours / 24)} days)
          </button>
        )}
      </div>

      <section aria-label="Reference analysis results" className="max-w-2xl">
        <p className="mb-3 text-sm text-text-muted">
          From the reference dataset this tool is built on — a Swedish household, full-year 2024
          data, 13.82 kWh battery, optimal no-sell strategy (corrected accounting):
        </p>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          <StatTile label="Annual savings" value={`${formatSek(REFERENCE.annualSavings)}/yr`} />
          <StatTile label="Cost reduction" value={formatPercent(REFERENCE.costReduction)} />
          <StatTile label="Payback" value={REFERENCE.payback} />
        </div>
      </section>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-4">
      <div className="text-sm text-text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  );
}
