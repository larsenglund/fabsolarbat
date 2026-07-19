import { Analysis } from "./components/Analysis";
import { InfoPage } from "./components/InfoPage";
import { Landing } from "./components/Landing";
import { useAppStore } from "./store/appStore";

const REPO_URL = "https://github.com/larsenglund/fabsolarbat";

export function App() {
  const view = useAppStore((s) => s.view);
  const progress = useAppStore((s) => s.progress);
  const datasetMeta = useAppStore((s) => s.datasetMeta);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1320px] flex-col px-6">
      {/* Thin accent progress bar while a simulation runs (DESIGN §Motion). */}
      <div className="fixed inset-x-0 top-0 z-10 h-0.5" aria-hidden>
        {progress !== null && (
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        )}
      </div>

      <header className="flex items-center justify-between gap-3 py-6">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-accent">⚡</span> fabsolarbat
        </span>
        <div className="flex items-center gap-3">
          {view === "analysis" && datasetMeta && (
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted">
              {datasetMeta.label}
            </span>
          )}
          <button
            type="button"
            onClick={() => useAppStore.getState().setView("about")}
            className="text-sm text-text-muted transition-colors hover:text-text"
          >
            How it works
          </button>
          <a
            href={REPO_URL}
            className="text-sm text-text-muted transition-colors hover:text-text"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      {view === "landing" ? <Landing /> : view === "about" ? <InfoPage /> : <Analysis />}

      <footer className="mt-8 border-t border-border py-6 text-sm text-text-muted">
        Open source · no tracking · all computation happens client-side
      </footer>
    </div>
  );
}
