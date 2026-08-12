import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { digestOf } from "@narratage/core";
import {
  createBuildDispatchIdentity,
  operationCancellationRequestId,
  sealOperationIdentity,
} from "@narratage/runtime";
import {
  createSqliteRuntimeServicePackage,
  SqliteRuntimeState,
} from "@narratage/store-sqlite";

import { createGreetingBuild } from "../../core/test/greeting-fixture.js";

test("SQLite stores verified Build facts and Operation checkpoints across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-sqlite-"));
  const path = join(directory, "runtime.sqlite");
  try {
    const first = new SqliteRuntimeState(path);
    const initial = createGreetingBuild();
    const created = await first.builds.create("video", initial);
    assert.equal(created.revision, 0);
    await first.catalog.record("video", {
      format: "svml.build-catalog-descriptor@1",
      core: initial.id,
      source: { path: "/project/main.svml", closure: digestOf("source-closure") },
      aliases: [{
        name: "final.video",
        type: initial.plan.goals[0]!.type,
        ref: { kind: "logical-output", id: initial.request.targets[0]!.output },
      }],
    });
    const operation = sealOperationIdentity({
      build: "video",
      command: "command:generation",
      endpoint: "kie.personal",
      authority: "kie.personal",
      route: "fixture.generation",
      implementationDigest: digestOf("kie-implementation"),
      runtimeClosure: digestOf("runtime-closure"),
      requestDigest: digestOf("generation-request"),
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
  const directory = await mkdtemp(join(tmpdir(), "svml-operation-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const identity = sealOperationIdentity({
      build: "video",
      command: "command:render",
      endpoint: "hyperframes.lambda",
      authority: "hyperframes.lambda",
      route: "fixture.render",
      implementationDigest: digestOf("hyperframes-lambda"),
      runtimeClosure: digestOf("runtime"),
      requestDigest: digestOf("render-request"),
      attempt: 1,
    });
    await state.operations.create(identity);
    const completed = await state.operations.compareAndSwap(identity.id, 0, {
      status: "completed",
      completion: {
        value: { kind: "inline", value: { artifact: "video.mp4" } },
        metadata: { task: "lambda-1" },
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
  const directory = await mkdtemp(join(tmpdir(), "svml-sqlite-cancel-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const identity = sealOperationIdentity({
      build: "cancel-build",
      command: "command:cancel",
      endpoint: "endpoint.cancel",
      authority: "endpoint.cancel",
      route: "fixture.cancel",
      implementationDigest: digestOf("implementation.cancel"),
      runtimeClosure: digestOf("runtime.cancel"),
      requestDigest: digestOf("request.cancel"),
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

test("Host Catalog schema changes do not change the execution Runtime Closure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-sqlite-closure-"));
  try {
    const services = createSqliteRuntimeServicePackage({ path: join(directory, "runtime.sqlite") });
    assert.deepEqual(
      services.services.map((item) => item.instance.configurationDigest),
      [
        ...Array(4).fill(digestOf({ path: join(directory, "runtime.sqlite"), schemaVersion: 6, busyTimeoutMs: 5_000 })),
      ],
    );
    await services.close?.();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite fences expired Workers and shares capacity across Build dispatches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-sqlite-dispatch-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const closure = digestOf("runtime:dispatch-test");
    await state.dispatch.create(createBuildDispatchIdentity({
      build: "build-a", core: digestOf("core:a"), runtimeRevision: closure,
    }), { now: 100 });
    const first = await state.dispatch.claim({ runtimeRevision: closure, owner: "worker-a", token: "lease-a", now: 100, leaseMs: 10 });
    assert.ok(first?.lease);
    assert.equal(first.build, "build-a");
    assert.equal(first.lease.fence, 1);
    assert.equal(await state.dispatch.claim({ runtimeRevision: closure, owner: "worker-b", token: "early", now: 105, leaseMs: 10 }), undefined);
    const second = await state.dispatch.claim({ runtimeRevision: closure, owner: "worker-b", token: "lease-b", now: 111, leaseMs: 10 });
    assert.ok(second?.lease);
    assert.equal(second.lease.fence, 2);
    const paidResources = [{ id: "authority:paid", maxActive: 1, maxInFlight: 1 }];
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
      build: "build-b", core: digestOf("core:b"), runtimeRevision: closure,
    }), { now: 112 });
    const third = await state.dispatch.claim({ runtimeRevision: closure, owner: "worker-c", token: "lease-c", now: 112, leaseMs: 10 });
    assert.ok(third?.lease);
    const blocked = await state.dispatch.acquireCapacity({
      build: "build-b", command: "command:b", resources: paidResources, mode: "recoverable",
      buildLease: third.lease, owner: "worker-c", token: "capacity-c", now: 112, leaseMs: 10,
      limits: { globalActive: 1 },
    });
    assert.equal(blocked.status, "blocked");

    await state.dispatch.create(createBuildDispatchIdentity({
      build: "build-c", core: digestOf("core:c"), runtimeRevision: closure,
    }), { now: 200, priority: 100 });
    const fourth = await state.dispatch.claim({ runtimeRevision: closure, owner: "worker-d", token: "lease-d", now: 200, leaseMs: 10 });
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

test("one SQLite execution domain rejects a second Runtime Revision until prior work is terminal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-sqlite-revision-gate-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const firstRevision = digestOf("runtime:first");
    const secondRevision = digestOf("runtime:second");
    const firstIdentity = createBuildDispatchIdentity({
      build: "first-build",
      core: digestOf("core:first"),
      runtimeRevision: firstRevision,
    });
    assert.equal((await state.dispatch.create(firstIdentity, { now: 100 })).status, "created");
    assert.equal((await state.dispatch.create(firstIdentity, { now: 101 })).status, "existing");
    await assert.rejects(
      state.dispatch.create(createBuildDispatchIdentity({
        build: "second-build",
        core: digestOf("core:second"),
        runtimeRevision: secondRevision,
      }), { now: 102 }),
      /cannot enter this execution domain[\s\S]*first-build[\s\S]*original Runtime Profile/u,
    );

    const claimed = await state.dispatch.claim({
      runtimeRevision: firstRevision,
      owner: "worker:first",
      token: "lease:first",
      now: 103,
      leaseMs: 1_000,
    });
    assert.ok(claimed?.lease);
    await state.dispatch.finish("first-build", claimed.lease, "complete", undefined, 104);
    assert.equal((await state.dispatch.create(createBuildDispatchIdentity({
      build: "second-build",
      core: digestOf("core:second"),
      runtimeRevision: secondRevision,
    }), { now: 105 })).status, "created");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Authority and Route resources are acquired atomically across models", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-sqlite-hierarchy-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const closure = digestOf("runtime:hierarchical-capacity");
    const authority = { id: "authority:kie.main", maxActive: 2, maxInFlight: 2 };
    const seedance = { id: "route:kie.main/seedance-2-mini", maxActive: 1, maxInFlight: 1 };
    const minimax = { id: "route:kie.main/minimax-h3", maxActive: 2, maxInFlight: 2 };

    const leaseBuild = async (build: string, now: number) => {
      await state.dispatch.create(createBuildDispatchIdentity({
        build,
        core: digestOf(`core:${build}`),
        runtimeRevision: closure,
      }), { now });
      const claimed = await state.dispatch.claim({
        runtimeRevision: closure,
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
      resources: [authority, seedance],
      queue: { authority: "kie.main", route: "seedance-2-mini" },
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
      resources: [authority, seedance],
      queue: { authority: "kie.main", route: "seedance-2-mini" },
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
      resources: [authority, minimax],
      queue: { authority: "kie.main", route: "minimax-h3" },
      mode: "recoverable",
      buildLease: thirdLease,
      owner: "worker:minimax-a",
      token: "capacity:c",
      now: 103,
      leaseMs: 1_000,
      limits: { globalActive: 10 },
    });
    assert.equal(otherRoute.status, "acquired",
      "another model may use the remaining Provider Authority capacity");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
