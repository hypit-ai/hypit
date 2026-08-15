import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { digestOf } from "@narratage/core";
import {
  createBuildDispatchIdentity,
  nonTerminalDispatchPhases,
  operationCancellationRequestId,
  sealOperationIdentity,
} from "@narratage/runtime";
import {
  createSqliteRuntimeInfrastructurePackage,
  SqliteRuntimeState,
} from "@narratage/store-sqlite";

import { createGreetingBuild } from "../../core/test/greeting-fixture.js";

test("read-only SQLite observation of an absent archive creates no file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-read-only-"));
  const path = join(directory, ".svml", "runtime.sqlite");
  try {
    const state = new SqliteRuntimeState(path, { readOnly: true });
    assert.equal(await state.builds.read("missing"), undefined);
    assert.deepEqual(await state.dispatch.list(), []);
    state.close();
    await assert.rejects(stat(path), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "ENOENT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite stores verified Build facts and Operation checkpoints across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-"));
  const path = join(directory, "runtime.sqlite");
  try {
    const first = new SqliteRuntimeState(path);
    const initial = createGreetingBuild();
    const created = await first.builds.create("video", initial);
    assert.equal(created.revision, 0);
    const catalog = {
      format: "narratage.build-catalog-descriptor@1",
      core: initial.id,
      source: { path: "/project/main.svml", closure: digestOf("source-closure") },
      aliases: [{
        name: "final.video",
        ref: { kind: "logical-output", id: initial.request.targets[0]!.output },
      }],
    } as const;
    await first.catalog.record("video", catalog);
    assert.equal((await first.catalog.record("video", catalog)).aliases[0]?.name, "final.video");
    await assert.rejects(first.catalog.record("video", {
      ...catalog,
      aliases: [{ ...catalog.aliases[0], name: "renamed.video" }],
    }), /another source, Run Source or output naming/u);
    const operation = sealOperationIdentity({
      build: "video",
      command: "command:generation",
      endpoint: "kie.personal",
      pool: "kie.personal",
      lane: "fixture.generation",
      attempt: 1,
    });
    const operationCreated = await first.operations.create(operation);
    assert.equal(operationCreated.status, "created");
    const pending = await first.operations.compareAndSwap(operation.id, 0, {
      status: "pending",
      checkpoint: { remoteJob: "job-1" },
      wakeAt: 12_345,
      progress: { phase: "generating" },
    });
    assert.equal(pending.status, "stored");
    first.close();

    const second = new SqliteRuntimeState(path);
    assert.equal((await second.builds.read("video"))?.state.id, initial.id);
    assert.equal((await second.catalog.read("video"))?.aliases[0]?.name, "final.video");
    assert.deepEqual((await second.catalog.list()).map((item) => item.build), ["video"]);
    const restoredOperation = await second.operations.read(operation.id);
    assert.equal(restoredOperation?.status, "pending");
    assert.deepEqual(restoredOperation?.checkpoint, { remoteJob: "job-1" });
    assert.equal(restoredOperation?.wakeAt, 12_345);
    assert.deepEqual(restoredOperation?.progress, { phase: "generating" });
    assert.deepEqual((await second.operations.list({ build: "video" })).map((item) => item.id), [operation.id]);

    const updated = await second.builds.compareAndSwap("video", 0, initial);
    assert.equal(updated.status, "stored");
    const stale = await second.builds.compareAndSwap("video", 0, initial);
    assert.equal(stale.status, "conflict");
    if (stale.status === "conflict") assert.equal(stale.current.revision, 1);
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite Operation CAS preserves a terminal completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-operation-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const identity = sealOperationIdentity({
      build: "video",
      command: "command:render",
      endpoint: "hyperframes.lambda",
      pool: "hyperframes.lambda",
      lane: "fixture.render",
      attempt: 1,
    });
    await state.operations.create(identity);
    const completed = await state.operations.compareAndSwap(identity.id, 0, {
      status: "completed",
      completion: {
        value: { kind: "inline", value: { artifact: "video.mp4" } },
      },
    });
    assert.equal(completed.status, "stored");
    assert.equal((await state.operations.read(identity.id))?.status, "completed");
    await assert.rejects(
      state.operations.compareAndSwap(identity.id, 1, {
        status: "pending",
        checkpoint: { task: "tampered" },
      }),
      /already terminal/u,
    );
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite keeps cancellation control independent from execution state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-cancel-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const identity = sealOperationIdentity({
      build: "cancel-build",
      command: "command:cancel",
      endpoint: "endpoint.cancel",
      pool: "endpoint.cancel",
      lane: "fixture.cancel",
      attempt: 1,
    });
    await state.operations.create(identity);
    const requestId = operationCancellationRequestId(identity.id, 100);
    const controlled = await state.operations.compareAndSwap(identity.id, 0, {
      status: "control",
      cancellation: { requestedAt: 100, requestId, status: "unsupported", attempts: 1 },
    });
    assert.equal(controlled.status, "stored");
    const completed = await state.operations.compareAndSwap(identity.id, 1, {
      status: "completed",
      completion: {
        value: { kind: "inline", value: "late result" },
      },
    });
    assert.equal(completed.status, "stored");
    const reopened = await state.operations.read(identity.id);
    assert.equal(reopened?.status, "completed");
    assert.equal(reopened?.cancellation?.status, "unsupported");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite fences expired Workers and shares capacity across Build dispatches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-dispatch-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    await state.dispatch.create(createBuildDispatchIdentity({
      build: "build-a", core: digestOf("core:a"),
    }), { now: 100 });
    const first = await state.dispatch.claim({ owner: "worker-a", token: "lease-a", now: 100, leaseMs: 10 });
    assert.ok(first?.lease);
    assert.equal(first.build, "build-a");
    assert.equal(first.lease.fence, 1);
    assert.equal(await state.dispatch.claim({ owner: "worker-b", token: "early", now: 105, leaseMs: 10 }), undefined);
    const second = await state.dispatch.claim({ owner: "worker-b", token: "lease-b", now: 111, leaseMs: 10 });
    assert.ok(second?.lease);
    assert.equal(second.lease.fence, 2);
    const paidResources = [{ id: "pool:paid", maxActive: 1, maxInFlight: 1 }];
    await assert.rejects(
      state.dispatch.release("build-a", first.lease, { phase: "waiting", availableAt: 120 }, 112),
      /stale/u,
    );
    await assert.rejects(
      state.dispatch.acquireCapacity({
        build: "build-a", command: "command:a", resources: paidResources, mode: "recoverable",
        buildLease: first.lease, owner: "worker-a", token: "capacity-a", now: 112, leaseMs: 10,
        limits: { globalActive: 1 },
      }),
      /stale/u,
    );
    const reserved = await state.dispatch.acquireCapacity({
      build: "build-a", command: "command:a", resources: paidResources, mode: "recoverable",
      buildLease: second.lease, owner: "worker-b", token: "capacity-b", now: 112, leaseMs: 10,
      limits: { globalActive: 1 },
    });
    assert.equal(reserved.status, "acquired");

    // A control request can race with the leased Worker's final release. The Store must retain the
    // wake independently of the old ready timestamp so that release cannot overwrite it.
    await state.dispatch.wake("build-a", 113);
    const woken = await state.dispatch.release(
      "build-a",
      second.lease,
      { phase: "waiting", availableAt: 10_000 },
      114,
    );
    assert.equal(woken.availableAt, 113);
    assert.equal(woken.phase, "waiting");

    await state.dispatch.create(createBuildDispatchIdentity({
      build: "build-b", core: digestOf("core:b"),
    }), { now: 112 });
    const third = await state.dispatch.claim({ owner: "worker-c", token: "lease-c", now: 112, leaseMs: 10 });
    assert.ok(third?.lease);
    const blocked = await state.dispatch.acquireCapacity({
      build: "build-b", command: "command:b", resources: paidResources, mode: "recoverable",
      buildLease: third.lease, owner: "worker-c", token: "capacity-c", now: 112, leaseMs: 10,
      limits: { globalActive: 1 },
    });
    assert.equal(blocked.status, "blocked");

    await state.dispatch.create(createBuildDispatchIdentity({
      build: "build-c", core: digestOf("core:c"),
    }), { now: 200, priority: 100 });
    const fourth = await state.dispatch.claim({ owner: "worker-d", token: "lease-d", now: 200, leaseMs: 10 });
    assert.ok(fourth?.lease);
    await state.dispatch.requestCancellation("build-c", "stop", 201);
    const cancelledWake = await state.dispatch.release(
      "build-c",
      fourth.lease,
      { phase: "waiting", availableAt: 20_000 },
      202,
    );
    assert.equal(cancelledWake.admission, "closing");
    assert.equal(cancelledWake.availableAt, 201,
      "a cancellation racing with release cannot be delayed by the Worker's stale schedule");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cancelling a never-claimed Build atomically withdraws it from dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-cancel-queued-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    await state.dispatch.create(createBuildDispatchIdentity({
      build: "queued-build",
      core: digestOf("core:queued-build"),
    }), { now: 100 });

    const cancelled = await state.dispatch.requestCancellation("queued-build", "no longer needed", 101);
    assert.equal(cancelled.phase, "terminal");
    assert.equal(cancelled.admission, "closed");
    assert.equal(cancelled.terminal, "cancelled");
    assert.equal(cancelled.cancellation?.requestedAt, 101);
    assert.equal(cancelled.cancellation?.reason, "no longer needed");
    assert.equal(await state.dispatch.claim({
      owner: "worker",
      token: "lease",
      now: 102,
      leaseMs: 1_000,
    }), undefined, "a cancelled queued Build can never be claimed");
    assert.deepEqual(await state.dispatch.list({ phases: nonTerminalDispatchPhases }), []);

    const repeated = await state.dispatch.requestCancellation("queued-build", "second reason", 103);
    assert.deepEqual(repeated, cancelled, "terminal cancellation is idempotent");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Pool and Lane resources are acquired atomically across models", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-hierarchy-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const pool = { id: "pool:kie.main", maxActive: 2, maxInFlight: 2 };
    const seedance = { id: "lane:kie.main/seedance-2-mini", maxActive: 1, maxInFlight: 1 };
    const minimax = { id: "lane:kie.main/minimax-h3", maxActive: 2, maxInFlight: 2 };

    const leaseBuild = async (build: string, now: number) => {
      await state.dispatch.create(createBuildDispatchIdentity({
        build,
        core: digestOf(`core:${build}`),
      }), { now });
      const claimed = await state.dispatch.claim({
        owner: `worker:${build}`,
        token: `lease:${build}`,
        now,
        leaseMs: 1_000,
      });
      assert.equal(claimed?.build, build);
      assert.ok(claimed.lease);
      return claimed.lease;
    };

    const firstLease = await leaseBuild("seedance-a", 100);
    const first = await state.dispatch.acquireCapacity({
      build: "seedance-a",
      command: "generate:a",
      resources: [pool, seedance],
      queue: { pool: "kie.main", lane: "seedance-2-mini" },
      mode: "recoverable",
      buildLease: firstLease,
      owner: "worker:seedance-a",
      token: "capacity:a",
      now: 100,
      leaseMs: 1_000,
      limits: { globalActive: 10 },
    });
    assert.equal(first.status, "acquired");
    assert.ok(first.reservation.active);
    await state.dispatch.parkCapacity(first.reservation.id, first.reservation.active, true, 101);

    const secondLease = await leaseBuild("seedance-b", 102);
    const sameRoute = await state.dispatch.acquireCapacity({
      build: "seedance-b",
      command: "generate:b",
      resources: [pool, seedance],
      queue: { pool: "kie.main", lane: "seedance-2-mini" },
      mode: "recoverable",
      buildLease: secondLease,
      owner: "worker:seedance-b",
      token: "capacity:b",
      now: 102,
      leaseMs: 1_000,
      limits: { globalActive: 10 },
    });
    assert.deepEqual(sameRoute, {
      status: "blocked",
      retryAt: 202,
      reason: "resource-in-flight",
      resource: seedance.id,
    });

    const thirdLease = await leaseBuild("minimax-a", 103);
    const otherRoute = await state.dispatch.acquireCapacity({
      build: "minimax-a",
      command: "generate:c",
      resources: [pool, minimax],
      queue: { pool: "kie.main", lane: "minimax-h3" },
      mode: "recoverable",
      buildLease: thirdLease,
      owner: "worker:minimax-a",
      token: "capacity:c",
      now: 103,
      leaseMs: 1_000,
      limits: { globalActive: 10 },
    });
    assert.equal(otherRoute.status, "acquired",
      "another model may use the remaining Provider Pool capacity");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
