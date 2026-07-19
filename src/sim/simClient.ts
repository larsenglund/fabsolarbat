import type { AnnualResult, EngineParams, HourRecord } from "../engine/types";
import type { RunMessage, WorkerReply } from "../workers/simulation.worker";

/**
 * Main-thread client for the simulation worker. One worker instance for the
 * app's lifetime (keeps the wasm warm); runs are serialized inside the worker
 * and identified by a monotonically increasing id — only the latest id's
 * progress/result is surfaced, so rapid parameter changes never race.
 */
export interface RunHandlers {
  onProgress: (day: number, totalDays: number) => void;
  onDone: (result: AnnualResult) => void;
  onError: (message: string) => void;
}

let worker: Worker | undefined;
let currentId = 0;
let handlers: RunHandlers | undefined;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const msg = event.data;
      if (msg.id !== currentId || !handlers) return; // superseded run
      if (msg.type === "progress") handlers.onProgress(msg.day, msg.totalDays);
      else if (msg.type === "done") handlers.onDone(msg.result);
      else handlers.onError(msg.message);
    };
    worker.onerror = (event) => {
      handlers?.onError(event.message || "Simulation worker crashed");
    };
  }
  return worker;
}

export function startRun(hours: HourRecord[], params: EngineParams, h: RunHandlers): void {
  currentId++;
  handlers = h;
  const msg: RunMessage = { type: "run", id: currentId, hours, params };
  getWorker().postMessage(msg);
}
