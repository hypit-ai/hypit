import assert from "node:assert/strict";
import test from "node:test";

import { applyOperationUpdate } from "@hypit/runtime";
import type { OperationSnapshot } from "@hypit/runtime";

const queued: OperationSnapshot = {
  id: "operation:test",
  build: "build:test",
  command: "command:test",
  endpoint: "endpoint:test",
  createdAt: 1,
  need: {
    id: "need:test",
    capability: { module: { name: "test", version: "1" }, name: "generate" },
    returns: { module: { name: "test", version: "1" }, name: "value" },
    constraints: null,
    result: "record:test",
  },
  credentials: {},
  status: "queued",
};

test("Operation lifecycle permits waiting updates and forward progress", () => {
  const waiting = applyOperationUpdate(queued, { status: "queued", wakeAt: 2 });
  const submitting = applyOperationUpdate(waiting, { status: "submitting" });
  const running = applyOperationUpdate(submitting, {
    status: "running", handle: { job: "one" }, acknowledgedAt: 3,
  });
  const polled = applyOperationUpdate(running, {
    status: "running", handle: { job: "one" }, acknowledgedAt: 3, wakeAt: 4,
  });
  const received = applyOperationUpdate(polled, {
    status: "received", value: "done", acknowledgedAt: 3, endedAt: 5,
  });
  assert.equal(applyOperationUpdate(received, {
    status: "completed", value: "done", acknowledgedAt: 3, endedAt: 5,
  }).status, "completed");
});

test("Operation lifecycle rejects reverse and terminal replacement", () => {
  const running: OperationSnapshot = {
    ...queued, status: "running", handle: { job: "one" }, acknowledgedAt: 2,
  };
  assert.throws(() => applyOperationUpdate(running, { status: "queued" }), /running to queued/u);
  const failed = applyOperationUpdate(running, {
    status: "failed", failure: { code: "REMOTE", message: "failed" }, endedAt: 3,
  });
  assert.throws(() => applyOperationUpdate(failed, {
    status: "failed", failure: { code: "OTHER", message: "replacement" }, endedAt: 4,
  }), /failed to failed/u);
});
