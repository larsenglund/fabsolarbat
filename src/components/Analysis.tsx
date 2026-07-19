import { useAppStore } from "../store/appStore";
import { AssumptionsBar } from "./AssumptionsBar";
import { DayDrilldown } from "./DayDrilldown";
import { HeroStats } from "./HeroStats";
import { HourlyExplorer } from "./HourlyExplorer";
import { MonthlyChart } from "./MonthlyChart";
import { ParamSidebar } from "./ParamSidebar";
import { ProjectionChart } from "./ProjectionChart";

export function Analysis() {
  const progress = useAppStore((s) => s.progress);
  const error = useAppStore((s) => s.error);
  const result = useAppStore((s) => s.result);
  const dataset = useAppStore((s) => s.dataset);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <ParamSidebar />

      <div className="min-w-0 flex-1">
        <AssumptionsBar />

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-negative/40 bg-surface p-4 text-sm text-negative"
          >
            {error}
          </div>
        )}

        {/* Previous results stay visible but dimmed while a run is in flight. */}
        <div
          className={`mt-3 flex flex-col gap-4 transition-opacity duration-150 ${
            progress !== null ? "opacity-60" : ""
          }`}
          aria-busy={progress !== null}
        >
          {result ? (
            <>
              <HeroStats />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <MonthlyChart />
                <ProjectionChart />
              </div>
              <HourlyExplorer />
              <DayDrilldown />
            </>
          ) : (
            !error && (
              <div className="rounded-xl border border-border bg-surface-2 p-8 text-center text-sm text-text-muted">
                {dataset
                  ? "Running the first simulation — a year of daily optimizations…"
                  : "Loading the sample dataset…"}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
