import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoryOperationStore,
  sealOperationIdentity,
} from "@narratage/runtime";

function operation() {
  return sealOperationIdentity({
    id: "operation:render",
    build: "video-42",
    command: "command:render",
    endpoint: "hyperframes.local",
    pool: "hyperframes.local",
    lane: "render",
  });
}

test("OperationStore keeps the handle needed to poll external work", async () => {
  const store = new MemoryOperationStore();
  const identity = operation();
  await store.create({ ...identity,
    status: "pending",
    handle: { remoteJob: "job-123" },
    wakeAt: 10_000,
    progress: { phase: "rendering", completed: 12, total: 60, unit: "frames" },
  });

  const pending = await store.read(identity.id);
  assert.equal(pending?.status, "pending");
  assert.deepEqual(pending?.handle, { remoteJob: "job-123" });
  assert.deepEqual((await store.list({ build: "video-42" })).map((item) => item.id), [identity.id]);
});

test("OperationStore records the external result", async () => {
  const store = new MemoryOperationStore();
  const identity = operation();
  const completed = await store.create({ ...identity,
    status: "completed",
    completion: { value: { kind: "inline", value: { artifact: "video.mp4" } } },
  });
  assert.equal(completed.status, "completed");
  assert.equal((await store.read(identity.id))?.status, "completed");
});
