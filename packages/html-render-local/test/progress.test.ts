import assert from "node:assert/strict";
import test from "node:test";
import type { OperationProgress } from "@hypit/endpoint";
import { renderProgressReporter } from "../src/progress.js";

test("parallel render progress sums frames and does not regress when another browser starts", async () => {
  let clock = 0;
  const reports: OperationProgress[] = [];
  const reporter = renderProgressReporter(async (p) => { reports.push(p); }, 20, () => clock);
  reporter.onProgress({ phase: "staging", elapsedMs: 0 });
  reporter.onProgress({ phase: "decoding", completed: 0, total: 15, elapsedMs: 0 });
  const worker = (n: number) => ({ worker: n, range: { startFrame: n * 10, endFrameExclusive: (n + 1) * 10 }, browserPid: undefined, elapsedMs: 0 });
  reporter.onProgress({ phase: "worker-start", ...worker(0) });
  reporter.onProgress({ phase: "worker-initializing", ...worker(1) });
  reporter.onProgress({ phase: "worker-start", ...worker(1) });
  reporter.onProgress({ phase: "worker-progress", worker: 0, completed: 4, elapsedMs: 0 });
  clock = 1_001;
  reporter.onProgress({ phase: "worker-progress", worker: 1, completed: 3, elapsedMs: 0 });
  reporter.onProgress({ phase: "worker-complete", ...worker(0), completed: 14 });
  reporter.onProgress({ phase: "worker-complete", ...worker(1), completed: 6 });
  reporter.onProgress({ phase: "encoding", elapsedMs: 0 });
  reporter.onProgress({ phase: "storing", elapsedMs: 0 });
  await reporter.flush();
  assert.deepEqual(reports.map((p) => [p.phase, p.completed]), [
    ["preparing resources", undefined], ["decoding source frames", 0],
    ["rasterizing frames", 0], ["rasterizing frames", 7], ["rasterizing frames", 20],
    ["encoding video", undefined], ["storing output", undefined],
  ]);
});
