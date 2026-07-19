import { simulateYear } from "../engine/simulate";
import type { AnnualResult, EngineParams, HourRecord } from "../engine/types";

/**
 * One worker, three message types. Runs are identified by id; the client
 * ignores results whose id is no longer current, so a queued run that was
 * superseded mid-flight costs nothing but wasted cycles.
 */
export interface RunMessage {
  type: "run";
  id: number;
  hours: HourRecord[];
  params: EngineParams;
}

export type WorkerReply =
  | { type: "progress"; id: number; day: number; totalDays: number }
  | { type: "done"; id: number; result: AnnualResult }
  | { type: "error"; id: number; message: string };

const post = (msg: WorkerReply) => postMessage(msg);

addEventListener("message", async (event: MessageEvent<RunMessage>) => {
  const { id, hours, params } = event.data;
  try {
    let lastPosted = 0;
    const result = await simulateYear(hours, {
      params,
      retainHourly: true,
      onProgress: (day, totalDays) => {
        // Throttle progress to ~every 10 days; always post the final day.
        if (day - lastPosted >= 10 || day === totalDays) {
          lastPosted = day;
          post({ type: "progress", id, day, totalDays });
        }
      },
    });
    post({ type: "done", id, result });
  } catch (err) {
    post({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
  }
});
