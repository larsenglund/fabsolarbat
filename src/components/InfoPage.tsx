import type { ReactNode } from "react";
import { useAppStore } from "../store/appStore";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="max-w-3xl">
      <h2 className="mt-10 text-xl font-semibold tracking-tight first:mt-0">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-text-muted [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}

/** Plain-language explanation of the whole calculation, per the M2 follow-up. */
export function InfoPage() {
  const setView = useAppStore((s) => s.setView);
  const hasDataset = useAppStore((s) => s.dataset !== null);

  return (
    <main className="flex-1 py-10">
      <button
        type="button"
        onClick={() => setView(hasDataset ? "analysis" : "landing")}
        className="mb-8 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-semibold tracking-tight">How the calculations work</h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-text-muted">
        This page explains, in plain terms, exactly what happens between your data going in and a
        payback figure coming out. No formulas required — but nothing important is hidden either.
      </p>

      <Section title="What the tool actually does">
        <p>
          It replays a full year of your household's electricity life, hour by hour, twice: once{" "}
          <strong>without</strong> a battery (what you actually paid) and once <strong>with</strong>{" "}
          a simulated battery operated as cleverly as possible. The difference between those two
          yearly bills is the battery's savings. Everything else — payback time, return on
          investment — is built from that number.
        </p>
      </Section>

      <Section title="The data it works from">
        <p>
          Three hourly series drive everything: <strong>consumption from the grid</strong> (what
          your meter imported), <strong>excess solar</strong> (what your meter exported), and the{" "}
          <strong>spot price</strong> for your bidding zone. Note what the meter can't see: solar
          power you used directly in the house never passes the meter, so it's invisible — and
          irrelevant, since the battery can't improve on power that's already free.
        </p>
      </Section>

      <Section title="What a kilowatt-hour really costs">
        <p>
          Buying: <strong>spot price × VAT + grid transfer fee + retailer markup</strong>. Note that
          VAT is on <em>everything</em>: the fee and markup are simply entered as they appear on
          your bill, VAT already included, while the spot price gets its VAT explicitly —
          mathematically identical to adding VAT on the whole sum. These per-kWh charges apply to
          every purchased kWh, which makes avoided purchases more valuable than the spot price alone
          suggests. Selling (if the sell model is on): exported solar earns{" "}
          <strong>spot price + export bonus</strong> — no VAT on what you sell, and Sweden's former
          0.60 kr/kWh tax reduction is abolished, so it's deliberately not included.
        </p>
      </Section>

      <Section title="The daily planning ritual">
        <p>
          Around 13:00 every day, the Nord Pool exchange publishes hourly electricity prices for all
          of tomorrow. So at 13:00 the household suddenly knows prices for the next{" "}
          <strong>35 hours</strong> — the rest of today plus all of tomorrow. The simulation
          re-creates that moment daily: it takes the known prices, an estimate of coming solar, and
          the battery's current charge, and makes a plan for those 35 hours. Tomorrow at 13:00, a
          fresh plan replaces the tail of the old one, just as a real smart battery would replan.
        </p>
      </Section>

      <Section title="How the optimizer thinks">
        <p>
          The planning itself uses <strong>linear programming</strong> (LP) — a mathematical method
          that finds the provably cheapest schedule, not just a decent one. Think of it as a
          perfectly rational butler: for each of the 35 hours it may charge the battery from solar,
          charge it from the grid, or discharge it to power the house. The butler must respect the
          physics: the battery can't hold more than its capacity or go below its reserve floor,
          can't charge or discharge faster than its power rating, loses a few percent of energy in
          each direction, and can't use more solar than actually exists.
        </p>
        <p>
          Within those rules, the LP finds the schedule with the <strong>lowest total cost</strong>:
          it charges in the cheapest hours (or from solar), discharges in the most expensive ones,
          and does nothing when the price gap is too small to pay for the round-trip losses. When
          selling is enabled, it also weighs every solar charge against the sale it forgoes. Because
          the method is exact, the result is an upper bound on what any real control system could
          achieve with the same information.
        </p>
      </Section>

      <Section title="Forecasting the sun">
        <p>
          Prices are known a day ahead; sunshine is not. During planning, future solar is therefore{" "}
          <strong>estimated</strong> — by default from the recent days' pattern, scaled by how sunny
          this morning actually turned out. When the plan is then "executed" against what the sun
          really did, surprises are handled sensibly: shortfalls reduce charging, and the battery
          never exceeds its limits. This gap between plan and reality is exactly what a real system
          experiences, which keeps the results honest.
        </p>
      </Section>

      <Section title="Honest bookkeeping">
        <p>
          Two accounting rules matter more than they sound. <strong>First</strong>: consecutive
          daily plans overlap by 11 hours, and only the first 24 hours of each plan actually happen
          — the tail is replanned the next day. The tool counts every real hour exactly once
          ("executed-hours accounting"); a calculation that skips this rule double-counts the
          overlap and roughly <strong>doubles</strong> the apparent savings, an easy trap for
          battery calculators. <strong>Second</strong>: every kWh the battery delivers counts toward
          its cycle life, so capacity fades over the years, and the long-term projections use that
          fading capacity rather than year-one performance forever.
        </p>
      </Section>

      <Section title="Why selling solar shrinks the battery's value">
        <p>
          A common surprise: turn on the sell-at-spot model and the battery's savings <em>drop</em>{" "}
          — even though selling solar is obviously better than wasting it. The resolution is that
          the tool always reports the battery's <strong>added value</strong>: the gap between the
          same household with and without a battery. Selling improves <em>both</em> of those bills,
          but it improves the no-battery baseline <em>more</em>, because a house without a battery
          sells every excess kilowatt-hour, while the battery diverts some into storage and gives up
          those sales. On the 2024 sample data:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-1.5 pr-3 font-medium text-text">Yearly cost (sample data)</th>
                <th className="px-3 py-1.5 font-medium text-text">Solar wasted</th>
                <th className="px-3 py-1.5 font-medium text-text">Solar sold</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-3">Without battery</td>
                <td className="px-3 py-1.5">25 164 kr</td>
                <td className="px-3 py-1.5">22 347 kr</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-3">With battery</td>
                <td className="px-3 py-1.5">21 197 kr</td>
                <td className="px-3 py-1.5">19 331 kr</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 font-medium text-text">Battery's added value</td>
                <td className="px-3 py-1.5 font-medium text-text">3 967 kr/yr</td>
                <td className="px-3 py-1.5 font-medium text-text">3 016 kr/yr</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Read the columns top to bottom: the household is best off selling <em>and</em> owning a
          battery (19 331 kr). But since you can sell solar without buying anything, the fair
          question for the battery is what it adds on top — and once every stored kilowatt-hour
          carries the cost of a foregone sale, its edge per solar kWh shrinks to the tax-and-fee
          wedge between buying and selling prices. The no-sell model, by pretending exports are
          worthless, quietly flatters the battery.
        </p>
      </Section>

      <Section title="From savings to a verdict">
        <p>
          The yearly saving feeds three viewpoints. <strong>Payback</strong>: how many years of
          (degradation-adjusted) savings repay the system cost. <strong>Net present value</strong>:
          the same stream of future savings, discounted because money later is worth less than money
          now, minus the price of the system. <strong>Opportunity cost</strong>: what the same money
          would have grown to in, say, an index fund over the horizon. A battery can have a payback
          within its lifetime and still lose to the fund — both facts are shown.
        </p>
      </Section>

      <Section title="What the model does not capture">
        <p>
          Honest limits, so you can judge the numbers: consumption within each planning window is
          assumed known (real forecasts would do slightly worse) · the house's main-fuse limit is
          not enforced, so a few high-draw hours may be optimistic · the meter data is hourly, so
          within-hour solar-to-battery routing is approximated · degradation is linear in cycles
          with no calendar aging · peak-power grid tariffs and time-of-use transfer fees are not
          modeled yet · electricity prices are assumed to repeat the analyzed year. Most of these
          nudge results in the battery's favor, so treat the output as an{" "}
          <strong>optimistic ceiling</strong>, not a promise.
        </p>
      </Section>

      <p className="mt-10 max-w-3xl text-sm text-text-muted">
        Want the full technical story? The simulation engine is open source, heavily tested against
        a full year of real data, and documented in detail — see the{" "}
        <a
          href="https://github.com/larsenglund/fabsolarbat"
          target="_blank"
          rel="noreferrer"
          className="text-accent-strong underline underline-offset-2"
        >
          GitHub repository
        </a>
        .
      </p>
    </main>
  );
}
