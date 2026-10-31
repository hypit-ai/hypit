import type { OperationProgress } from "@hypit/hypit/endpoint";
import type { HtmlRasterProgress } from "./render.js";

/** Reduce parallel capture events to one readable progress report for this rasterization request. */
export function renderProgressReporter(
  report: ((progress: OperationProgress) => Promise<void>) | undefined,
  totalFrames: number,
  now: () => number = Date.now,
) {
  const workers = new Map<number, number>();
  let rendering = false;
  let lastPhase: string | undefined;
  let lastAt = -Infinity;
  let writes = Promise.resolve();
  const frames = () => ({ phase: "rasterizing frames", completed: [...workers.values()].reduce((a, b) => a + b, 0),
    total: totalFrames, unit: "frames" });
  return {
    onProgress(event: HtmlRasterProgress): void {
      if (report === undefined) return;
      let progress: OperationProgress;
      switch (event.phase) {
        case "staging": progress = { phase: "preparing resources" }; break;
        case "decoding": progress = { phase: "decoding source frames", completed: event.completed, total: event.total, unit: "frames" }; break;
        case "prepared":
        case "worker-initializing":
          if (rendering) return;
          progress = { phase: "starting browsers" }; break;
        case "worker-start":
          rendering = true;
          workers.set(event.worker, 0);
          progress = frames(); break;
        case "worker-progress":
          workers.set(event.worker, event.completed);
          progress = frames(); break;
        case "worker-complete":
          workers.set(event.worker, event.completed);
          progress = frames(); break;
        case "encoding": progress = { phase: "encoding video" }; break;
        case "storing": progress = { phase: "storing output" }; break;
        case "complete": return;
      }
      const at = now();
      if (progress.phase === lastPhase && at - lastAt < 1_000
        && (progress.total === undefined || progress.completed !== progress.total)) return;
      lastPhase = progress.phase;
      lastAt = at;
      // Attach rejection handling immediately; flush still propagates storage failure to the caller.
      writes = writes.then(() => report(progress));
      void writes.catch(() => {});
    },
    flush: () => writes,
  };
}
