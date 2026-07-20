import { useEffect } from "react";
import { Analysis } from "./components/Analysis";
import { InfoPage } from "./components/InfoPage";
import { Landing } from "./components/Landing";
import { UploadPage } from "./components/UploadPage";
import { useAppStore } from "./store/appStore";

const REPO_URL = "https://github.com/larsenglund/fabsolarbat";

export function App() {
  const view = useAppStore((s) => s.view);
  const progress = useAppStore((s) => s.progress);
  const datasetMeta = useAppStore((s) => s.datasetMeta);

  useEffect(() => {
    void useAppStore.getState().initPersisted();
  }, []);

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
        <button
          type="button"
          onClick={() => useAppStore.getState().setView("landing")}
          title="Back to the start page"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <svg
            viewBox="0 0 32 32"
            className="h-[1.15em] w-[1.15em] text-accent"
            role="presentation"
            aria-hidden
            fill="none"
          >
            <rect
              x="3"
              y="9"
              width="23"
              height="14"
              rx="3"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <rect x="28" y="13" width="3" height="6" rx="1" fill="currentColor" />
            <rect x="7" y="12.5" width="3.5" height="7" rx="1" fill="currentColor" />
            <rect x="12.75" y="12.5" width="3.5" height="7" rx="1" fill="currentColor" />
            <rect x="18.5" y="12.5" width="3.5" height="7" rx="1" fill="currentColor" />
          </svg>
          Batterikollen
        </button>
        <div className="flex items-center gap-3">
          {view === "analysis" && datasetMeta && (
            <button
              type="button"
              onClick={() => useAppStore.getState().setView("landing")}
              title="Back to the start page to explore the sample or upload your own data"
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-text"
            >
              {datasetMeta.label} · switch data
            </button>
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

      {view === "landing" ? (
        <Landing />
      ) : view === "about" ? (
        <InfoPage />
      ) : view === "upload" ? (
        <UploadPage />
      ) : (
        <Analysis />
      )}

      <footer className="mt-8 border-t border-border py-6 text-sm text-text-muted">
        Open source · no tracking · all computation happens client-side
      </footer>
    </div>
  );
}
