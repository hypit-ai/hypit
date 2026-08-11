import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/core";
import {
  MemoryOperationStore,
  sealOperationIdentity,
  verifyOperationSnapshot,
} from "@narratage/runtime";

function identity(overrides: { readonly endpoint?: string; readonly runtimeClosure?: string } = {}) {
  return sealOperationIdentity({
    build: "video-42",
    command: "command:render",
    endpoint: overrides.endpoint ?? "hyperframes.local",
    implementationDigest: digestOf("hyperframes.local/implementation@1"),
    runtimeClosure: (overrides.runtimeClosure ?? digestOf("runtime-closure:local")) as never,
    requestDigest: digestOf("render-request"),
    attempt: 1,
  });
}

test("Operation identity locks Build, Command, Endpoint, implementation and Runtime Closure", () => {
  const first = identity();
  assert.equal(first.id, identity().id);
  assert.equal(first.submissionKey, identity().submissionKey);
  assert.notEqual(first.id, identity({ endpoint: "hyperframes.hosted" }).id);
  assert.notEqual(first.id, identity({ runtimeClosure: digestOf("runtime-closure:hosted") }).id);
});

test("OperationStore idempotently discovers an existing submission after restart", async () => {
  const store = new MemoryOperationStore();
  const operation = identity();
  const created = await store.create(operation);
  const restored = await store.create(operation);
  assert.equal(created.status, "created");
  assert.equal(restored.status, "existing");
  assert.equal(restored.snapshot.submissionKey, created.snapshot.submissionKey);
  assert.equal(restored.snapshot.revision, 0);
});

test("pending checkpoints and completion advance by CAS without entering BuildState", async () => {
  const store = new MemoryOperationStore();
  const operation = identity();
  await store.create(operation);
  const pending = await store.compareAndSwap(operation.id, 0, {
    status: "pending",
    checkpoint: { remoteJob: "job-123", pollAfterMs: 5_000 },
    wakeAt: 10_000,
    progress: { phase: "rendering", completed: 12, total: 60, unit: "frames" },
  });
  assert.equal(pending.status, "stored");
  if (pending.status !== "stored") return;
  assert.equal(pending.snapshot.status, "pending");
  assert.deepEqual(pending.snapshot.checkpoint, { remoteJob: "job-123", pollAfterMs: 5_000 });
  assert.equal(pending.snapshot.wakeAt, 10_000);
  assert.deepEqual(pending.snapshot.progress,
    { phase: "rendering", completed: 12, total: 60, unit: "frames" });
  assert.deepEqual((await store.list({ build: "video-42" })).map((item) => item.id), [operation.id]);

  const stale = await store.compareAndSwap(operation.id, 0, {
    status: "failed",
    failure: { code: "STALE", message: "must not win", retryable: true },
  });
  assert.equal(stale.status, "conflict");
  if (stale.status === "conflict") assert.equal(stale.current.revision, 1);

  const completed = await store.compareAndSwap(operation.id, 1, {
    status: "completed",
    completion: {
      value: { kind: "inline", value: { artifact: "video.mp4" } },
      conformance: "exact",
      delivery: "executed",
      metadata: { remoteJob: "job-123" },
    },
  });
  assert.equal(completed.status, "stored");
  if (completed.status === "stored") {
    assert.equal(completed.snapshot.status, "completed");
    assert.doesNotThrow(() => verifyOperationSnapshot(completed.snapshot));
  }
  assert.equal((await store.read(operation.id))?.status, "completed");
  await assert.rejects(
    store.compareAndSwap(operation.id, 2, {
      status: "pending",
      checkpoint: { remoteJob: "job-456" },
    }),
    /already terminal/u,
  );
});

test("pending progress is bounded and cannot leak into terminal execution facts", async () => {
  const store = new MemoryOperationStore();
  const operation = identity();
  await store.create(operation);
  await assert.rejects(store.compareAndSwap(operation.id, 0, {
    status: "pending",
    checkpoint: { remoteJob: "job-123" },
    progress: { phase: "rendering", completed: 61, total: 60, unit: "frames" },
  }), /progress exceeds/u);
});

test("OperationStore returns defensive snapshots", async () => {
  const store = new MemoryOperationStore();
  const operation = identity();
  const created = await store.create(operation);
  (created.snapshot as { endpoint: string }).endpoint = "tampered";
  assert.equal((await store.read(operation.id))?.endpoint, "hyperframes.local");
});
