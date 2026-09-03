import assert from "node:assert/strict";
import test from "node:test";

import {
  activityObservationKey,
  buildObservationKey,
  buildProgressLines,
  buildProgressView,
  observeBuildView,
} from "../src/observation.js";
import type { BuildProgressView } from "../src/observation.js";
import type { CliBuildView, CliRuntimeControl } from "../src/runtime-port.js";

function view(
  activity: CliBuildView["activity"],
  pending: number,
  completed: number,
): CliBuildView {
  return {
    id: "bld_20260903T000000000Z_0000000000",
    createdAt: Date.now(),
    activity,
    cancellationRequested: false,
    targets: ["final.video"],
    requests: { total: pending + completed, completed },
    acceptedRecords: 0,
    outstandingCommands: pending,
    operations: [
      ...Array.from({ length: pending }, () => ({
        endpoint: "kie.default",
        status: "pending" as const,
        progress: { phase: "generating" },
      })),
      ...Array.from({ length: completed }, () => ({ endpoint: "kie.default", status: "completed" as const })),
    ],
  };
}

test("Build observation ignores Worker turn churn and coalesces rapid real progress", async () => {
  const running = view("running", 7, 0);
  const waiting = view("waiting", 7, 0);
  const ready = view("ready", 7, 0);
  const advanced = view("running", 6, 1);
  assert.equal(buildObservationKey(running), buildObservationKey(waiting));
  assert.equal(buildObservationKey(waiting), buildObservationKey(ready));
  assert.notEqual(buildObservationKey(ready), buildObservationKey(advanced));

  const snapshots: Array<CliBuildView | undefined> = [waiting, ready, advanced, undefined];
  const progress: BuildProgressView[] = [];
  const runtime = {
    async inspect() { return snapshots.shift(); },
  } as Pick<CliRuntimeControl, "inspect">;

  const finished = await observeBuildView(runtime, running.id, running, {
    onProgress: (item) => progress.push(item),
  });

  assert.equal(finished, undefined);
  assert.deepEqual(progress.map((item) => item.requests), [
    { total: 7, completed: 0 },
  ]);
  assert.deepEqual(progress.map((item) => item.phases), [
    { generating: 7 },
  ]);
  assert.deepEqual(buildProgressLines(
    buildProgressView({ ...running, createdAt: 1_000 }, 32_000),
    { verbose: false, limit: 20 },
  ), [
    "  · Working · 0/7 steps complete · 7 generating · 31s",
  ]);
});

test("Runtime activity ignores capacity leases but observes Build progress", () => {
  const running = view("running", 7, 0);
  const waiting = view("waiting", 7, 0);
  const ready = view("ready", 7, 0);
  const advanced = view("running", 6, 1);
  const other = { ...advanced, id: "bld_20260903T000000001Z_0000000000" };

  assert.equal(
    activityObservationKey("running", [running]),
    activityObservationKey("running", [waiting]),
  );
  assert.equal(
    activityObservationKey("running", [waiting]),
    activityObservationKey("running", [ready]),
  );
  assert.notEqual(
    activityObservationKey("running", [waiting]),
    activityObservationKey("running", [advanced]),
  );
  assert.equal(
    activityObservationKey("running", [running, other]),
    activityObservationKey("running", [other, running]),
  );
});
