import { formatPercent, formatSek } from "./lib/format";

const REPO_URL = "https://github.com/larsenglund/fabsolarbat";

/* Headline numbers from the validated 2024 reference analysis (docs/PRIOR_WORK.md). */
const REFERENCE = {
  annualSavings: 8334,
  costReduction: 21.3,
  payback: "3.6–7.2 yr",
};

export function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-accent">⚡</span> fabsolarbat
        </span>
        <a
          href={REPO_URL}
          className="text-sm text-text-muted transition-colors hover:text-text"
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </header>

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
            disabled
            title="Coming with the simulation engine (milestone M2)"
            className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white opacity-50"
          >
            Explore sample data
          </button>
          <button
            type="button"
            disabled
            title="Coming with the upload wizard (milestone M3)"
            className="rounded-lg border border-border bg-surface px-5 py-2.5 font-medium opacity-50"
          >
            Upload your data
          </button>
        </div>

        <section aria-label="Reference analysis results" className="max-w-2xl">
          <p className="mb-3 text-sm text-text-muted">
            From the reference analysis this tool is built on — a Swedish household, full-year 2024
            data, 13.82 kWh battery:
          </p>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            <StatTile label="Annual savings" value={`${formatSek(REFERENCE.annualSavings)}/yr`} />
            <StatTile label="Cost reduction" value={formatPercent(REFERENCE.costReduction)} />
            <StatTile label="Payback" value={REFERENCE.payback} />
          </div>
        </section>

        <div className="max-w-2xl rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-text-muted">
          <span className="font-medium text-text">Under construction.</span> The build and deploy
          pipeline is live (milestone M0). Next up is the simulation engine, ported from the
          validated Python analysis. Follow the plan in{" "}
          <a
            href={`${REPO_URL}/blob/main/docs/PLAN.md`}
            className="text-accent underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            docs/PLAN.md
          </a>
          .
        </div>
      </main>

      <footer className="border-t border-border py-6 text-sm text-text-muted">
        Open source · no tracking · all computation happens client-side
      </footer>
    </div>
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
