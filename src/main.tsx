import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useAppStore } from "./store/appStore";
import { decodeScenario, encodeScenario } from "./urlState";
import "./index.css";

// Apply a shared scenario from the URL before first render. A `d=sample` flag
// opens the sample-data analysis directly so shared links land on results.
const decoded = decodeScenario(window.location.search);
if (decoded.hasScenario) {
  useAppStore.setState({ params: decoded.params, finance: decoded.finance });
}
if (decoded.openSample) {
  void useAppStore.getState().exploreSample();
}

// Keep the address bar shareable: reflect the active scenario into the query
// string on every relevant change (replaceState — no history spam).
let lastQuery: string | null = null;
useAppStore.subscribe((s) => {
  const query = encodeScenario(
    s.params,
    s.finance,
    s.view === "analysis" && s.datasetMeta?.source === "sample",
  );
  if (query === lastQuery) return;
  lastQuery = query;
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", url);
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
