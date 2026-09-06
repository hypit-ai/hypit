import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { BuildMachine, defineBuild } from "@hypit/core";
import { SqliteRuntimeState } from "@hypit/store-sqlite";

import { createGreetingBuild } from "../../core/test/greeting-fixture.js";

const resultLocation = {
  root: "/project",
  selection: { use: "@hypit/build-result-fs", config: { path: ".hypit/results" } },
} as const;

function definition(state: ReturnType<typeof createGreetingBuild>) {
  const authored = new Set(state.program.records.map((record) => record.id));
  return defineBuild({
    program: state.program,
    initialRecords: state.records.filter((record) => !authored.has(record.id)),
    plan: state.plan,
    targets: state.targets,
  });
}

test("read-only SQLite observation of an absent Runtime creates no file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-read-only-"));
  const path = join(directory, ".hypit", "runtime.sqlite");
  try {
    const state = new SqliteRuntimeState(path, { readOnly: true });
    assert.equal(await state.builds.read("missing"), undefined);
    assert.deepEqual(await state.execution.list(), []);
    assert.deepEqual(await state.submissions.list(), []);
    state.close();
    await assert.rejects(stat(path), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "ENOENT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite stores verified Build facts and Operation handles across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-"));
  const path = join(directory, "runtime.sqlite");
  try {
    const first = new SqliteRuntimeState(path);
    const initial = createGreetingBuild();
    const buildDefinition = definition(initial);
    await first.builds.create("video", buildDefinition);
    const catalog = {
      source: { path: "/project/main.svml" },
      publishedOutputs: [{
        name: "final.video",
        ref: { kind: "logical-output", id: initial.targets[0]!.output },
      }],
    } as const;
    await first.catalog.record("video", catalog);
    assert.equal((await first.catalog.read("video"))?.publishedOutputs[0]?.name, "final.video");
    const operation = {
      id: "operation:generation",
      build: "video",
      command: "command:generation",
      endpoint: "kie.personal",
    };
    const pending = await first.operations.create({ ...operation,
      status: "pending",
      handle: { remoteJob: "job-1" },
      wakeAt: 12_345,
      progress: { phase: "generating" },
    });
    assert.equal(pending.status, "pending");
    first.close();

    const second = new SqliteRuntimeState(path);
    assert.equal((await second.builds.read("video"))?.state.status, initial.status);
    assert.equal((await second.catalog.read("video"))?.publishedOutputs[0]?.name, "final.video");
    const restoredOperation = await second.operations.read(operation.id);
    assert.equal(restoredOperation?.status, "pending");
    assert.deepEqual(restoredOperation?.handle, { remoteJob: "job-1" });
    assert.equal(restoredOperation?.wakeAt, 12_345);
    assert.deepEqual(restoredOperation?.progress, { phase: "generating" });
    assert.deepEqual((await second.operations.list({ build: "video" })).map((item) => item.id), [operation.id]);

    const machine = new BuildMachine(buildDefinition);
    const command = machine.commands()[0]!;
    const content = { kind: "command-failed", command: command.id, code: "TEST", message: "test" } as const;
    const fact = machine.evaluate(content)!;
    await second.builds.append("video", fact);
    assert.equal((await second.builds.read("video"))?.facts.length, 1);
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite Operation updates preserve a terminal completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-operation-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const identity = {
      id: "operation:render",
      build: "video",
      command: "command:render",
      endpoint: "hyperframes.lambda",
    };
    const completed = await state.operations.create({ ...identity,
      status: "completed",
      completion: {
        value: { kind: "inline", value: { artifact: "video.mp4" } },
      },
    });
    assert.equal(completed.status, "completed");
    assert.equal((await state.operations.read(identity.id))?.status, "completed");
    assert.equal((await state.operations.update(identity.id, {
      status: "pending",
      handle: { task: "ignored" },
    })).status, "completed");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Submission is separate from execution and only commit or exact discard removes it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-submission-owner-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const initial = createGreetingBuild();
    await state.builds.create("existing-build", definition(initial));

    await assert.rejects(
      state.submissions.prepare({ build: "existing-build", componentPackages: [], result: resultLocation }),
      /already has Runtime state/u,
    );
    await state.submissions.discard("existing-build");
    assert.notEqual(await state.builds.read("existing-build"), undefined);

    const submission = await state.submissions.prepare({
      build: "new-build",
      componentPackages: ["example.component@1"],
      result: resultLocation,
    }, { now: 100 });
    assert.equal(submission.createdAt, 100);
    assert.equal(await state.execution.read("new-build"), undefined);
    await state.submissions.discard("new-build");
    assert.equal(await state.submissions.read("new-build"), undefined);
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Execution stores scheduling facts, one decision and independent operator attention", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-result-location-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const result = {
      root: "/profiles/team",
      selection: {
        use: "@hypit/build-result-s3",
        config: { bucket: "video-results", prefix: "projects/episode-12" },
      },
    } as const;
    const initial = createGreetingBuild();
    const buildDefinition = definition(initial);
    const request = { build: "queued-build", componentPackages: ["example.component@1"], result } as const;
    await state.submissions.prepare(request, { now: 100 });
    await state.submissions.commit({
      ...request,
      definition: buildDefinition,
      catalog: { source: { path: "/project/main.svml" }, publishedOutputs: [] },
    });
    assert.equal(await state.submissions.read("queued-build"), undefined);
    assert.deepEqual((await state.execution.read("queued-build"))?.result, result);

    const cancelling = await state.execution.requestStop("queued-build", { cause: "user-cancelled", reason: "no longer needed" });
    assert.equal(cancelling.stop?.reason, "no longer needed");
    const claimed = await state.execution.claim("worker-a", Date.now());
    assert.equal(claimed?.turn?.owner, "worker-a");
    const decided = await state.execution.decide("queued-build", "worker-a", "cancelled", "no longer needed");
    assert.deepEqual(decided.decision, { outcome: "cancelled", reason: "no longer needed" });
    assert.equal(await state.execution.claim("worker-b", Date.now() + 60_000), undefined);

    const writing = await state.execution.claimResultWrite("queued-build", "result-writer-a", 200);
    assert.equal(writing?.resultWrite?.owner, "result-writer-a");
    assert.equal(await state.execution.claimResultWrite("queued-build", "result-writer-b", 201), undefined);
    assert.equal((await state.execution.releaseResultWrite("queued-build", "result-writer-a")).resultWrite, undefined);

    const attention = await state.execution.setAttention("queued-build", {
      step: "result",
      error: "store unavailable",
    });
    assert.deepEqual(attention.attention, { step: "result", error: "store unavailable" });
    const completion = await state.removeActiveBuild("queued-build");
    assert.deepEqual(completion, { build: "queued-build", outcome: "cancelled", reason: "no longer needed" });
    assert.equal(await state.execution.read("queued-build"), undefined);
    assert.equal(await state.builds.read("queued-build"), undefined);
    assert.equal(await state.catalog.read("queued-build"), undefined);
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Submissions and Executions pin the literal Runtime environment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-environment-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    await state.environment.use('{"endpoints":{"kie":{"region":"us"}}}');
    await state.submissions.prepare({ build: "active-build", componentPackages: [], result: resultLocation }, { now: 100 });
    await assert.rejects(
      state.environment.use('{"endpoints":{"kie":{"region":"eu"}}}'),
      /pinned by active Builds/u,
    );
    await state.environment.assert('{"endpoints":{"kie":{"region":"us"}}}');
    await assert.rejects(
      state.environment.assert('{"endpoints":{"kie":{"region":"eu"}}}'),
      /no longer matches/u,
    );
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a new Worker reclaims abandoned turns and Result-writer leases without external work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-turn-reclaim-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    await state.execution.create({ build: "interrupted", componentPackages: [], result: resultLocation }, { now: 100 });
    assert.equal((await state.execution.claim("old-worker", 100))?.turn?.owner, "old-worker");
    assert.deepEqual(await state.execution.reclaimTurns(200), ["interrupted"]);
    assert.equal((await state.execution.read("interrupted"))?.turn, undefined);
    assert.equal((await state.execution.claim("new-worker", 200))?.turn?.owner, "new-worker");
    await state.execution.decide("interrupted", "new-worker", "failed", "provider stopped");
    assert.equal(
      (await state.execution.claimResultWrite("interrupted", "old-result-writer", 201))?.resultWrite?.owner,
      "old-result-writer",
    );
    assert.deepEqual(await state.execution.reclaimResultWrites(), ["interrupted"]);
    const interrupted = await state.execution.read("interrupted");
    assert.equal(interrupted?.resultWrite, undefined);
    assert.deepEqual(interrupted?.attention, {
      step: "result",
      error: "Result writing was interrupted; run hypit result finish <build-id>",
    });
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shared capacity resources are acquired atomically across Builds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-hierarchy-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const pool = { id: "pool:kie.main", limit: 2 };
    const seedance = { id: "capacity:kie.main/seedance-2-mini", limit: 1 };
    const minimax = { id: "capacity:kie.main/minimax-h3", limit: 2 };

    const first = await state.execution.acquireCapacity({
      build: "seedance-a",
      command: "generate:a",
      resources: [pool, seedance],
      now: 100,
    });
    assert.equal(first.status, "acquired");

    const sameRoute = await state.execution.acquireCapacity({
      build: "seedance-b",
      command: "generate:b",
      resources: [pool, seedance],
      now: 102,
    });
    assert.deepEqual(sameRoute, {
      status: "blocked",
      reason: "resource-in-flight",
      resource: seedance.id,
    });

    const otherRoute = await state.execution.acquireCapacity({
      build: "minimax-a",
      command: "generate:c",
      resources: [pool, minimax],
      now: 103,
    });
    assert.equal(otherRoute.status, "acquired");

    const independentProvider = await state.execution.acquireCapacity({
      build: "vertex-a",
      command: "observe:a",
      resources: [{ id: "pool:vertex.main", limit: 1 }],
      now: 103,
    });
    assert.equal(independentProvider.status, "acquired");

    if (first.status === "acquired") {
      await state.execution.releaseCapacity(first.reservation.build, first.reservation.command);
    }
    const retried = await state.execution.acquireCapacity({
      build: "seedance-b",
      command: "generate:b",
      resources: [pool, seedance],
      now: 104,
    });
    assert.equal(retried.status, "acquired");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("weighted capacity admits 4 + 2 workers atomically and survives reopening", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-weighted-capacity-"));
  const path = join(directory, "runtime.sqlite");
  let state = new SqliteRuntimeState(path);
  try {
    const claim = (build: string, units: number) => state.execution.acquireCapacity({ build, command: "render",
      resources: [{ id: "pool:render", limit: 3 }, { id: "capacity:render/browsers", limit: 6, units }], now: 100 });
    assert.equal((await claim("four", 4)).status, "acquired");
    assert.equal((await claim("two", 2)).status, "acquired");
    assert.equal((await claim("one", 1)).status, "blocked");
    assert.equal((await state.execution.listCapacity()).length, 2, "blocked requests must acquire no partial resources");
    state.close();
    state = new SqliteRuntimeState(path);
    assert.equal((await claim("one", 1)).status, "blocked");
    const restored = await state.execution.listCapacity();
    assert.equal(restored.find((item) => item.build === "four")?.resources.find((item) => item.id.endsWith("/browsers"))?.units, 4);
    assert.equal(restored.find((item) => item.build === "two")?.resources.find((item) => item.id.endsWith("/browsers"))?.units, 2);
    await state.execution.releaseCapacity("two", "render");
    assert.equal((await claim("three", 3)).status, "blocked");
    assert.equal((await claim("one", 1)).status, "acquired");
    await assert.rejects(claim("impossible", 7), /needs 7 units/);
  } finally { state.close(); await rm(directory, { recursive: true, force: true }); }
});

test("an execution already holding capacity is claimed before fresh work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-capacity-claim-order-"));
  const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
  try {
    await state.execution.create({ build: "fresh", componentPackages: [], result: resultLocation }, { now: 100 });
    await state.execution.create({ build: "in-flight", componentPackages: [], result: resultLocation }, { now: 101 });
    assert.equal((await state.execution.acquireCapacity({
      build: "in-flight",
      command: "remote",
      resources: [{ id: "pool:generation", limit: 2 }],
      now: 102,
    })).status, "acquired");
    assert.equal((await state.execution.claim("worker", 200))?.build, "in-flight");
  } finally {
    state.close();
    await rm(directory, { recursive: true, force: true });
  }
});


test("stop requests preserve their first cause and promptly wake the final execution turn", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-stop-request-"));
  const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
  try {
    await state.execution.create({ build: "stopping", componentPackages: [], result: resultLocation });
    await state.execution.claim("worker");
    const stop = { cause: "execution-failed" as const, reason: "original failure" };
    await state.execution.requestStop("stopping", stop);
    assert.deepEqual((await state.execution.requestStop("stopping", { cause: "user-cancelled", reason: "later" })).stop, stop);
    const wakeAt = Date.now() + 60_000;
    const unaware = await state.execution.releaseTurn("stopping", "worker", wakeAt);
    assert.ok(unaware.wakeAt! <= Date.now(), "a stop received during execution must be processed promptly");
    await state.execution.claim("worker");
    assert.deepEqual((await state.execution.decide("stopping", "worker", "cancelled", "later")).decision,
      { outcome: "failed", reason: "original failure" });
  } finally { state.close(); await rm(directory, { recursive: true, force: true }); }
});

test("shared action rates spend tokens on admission, independently of occupancy and pool", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-rates-"));
  const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
  try {
    const rate = { id: "rate:account/submit", limit: 2, periodMs: 1_000 };
    const slot = { id: "action:account/submit", limit: 1 };
    const acquire = (build: string, now: number) => state.execution.acquireCapacity({ build, command: "submit", resources: [slot, rate], now });
    assert.equal((await acquire("a", 0)).status, "acquired");
    assert.equal((await acquire("blocked", 0)).status, "blocked");
    await state.execution.releaseCapacity("a", "submit");
    assert.equal((await acquire("b", 0)).status, "acquired", "blocked work spends no rate tokens");
    await state.execution.releaseCapacity("b", "submit");
    const limited = await acquire("c", 0);
    assert.equal(limited.status, "blocked");
    assert.equal(limited.status === "blocked" && limited.availableAt, 500);
    assert.equal((await state.execution.acquireCapacity({ build: "other", command: "submit",
      resources: [{ ...rate, id: "rate:other-account/submit" }], now: 0 })).status, "acquired");
    assert.equal((await acquire("c", 500)).status, "acquired", "rate replenishes with time, not release");
  } finally { state.close(); await rm(directory, { recursive: true, force: true }); }
});

test("a resource release before parking is observed and later releases wake a fitting waiter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-capacity-wakeup-"));
  const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
  const resource = { id: "browsers", limit: 2 };
  const destination = { root: directory, selection: { use: "@hypit/build-result-fs" } };
  try {
    for (const [now, build] of ["holder", "waiter", "later"].entries()) {
      await state.execution.create({ build, componentPackages: [], result: destination }, { now });
    }
    await state.execution.acquireCapacity({ build: "holder", command: "render", resources: [{ ...resource, units: 2 }], now: Date.now() });
    assert.equal((await state.execution.claim("owner"))?.build, "holder");
    await state.execution.releaseTurn("holder", "owner", Date.now() + 60_000);
    assert.equal((await state.execution.claim("owner"))?.build, "waiter");
    assert.equal((await state.execution.acquireCapacity({ build: "waiter", command: "render", resources: [resource], now: Date.now() })).status, "blocked");
    await state.execution.releaseCapacity("holder", "render");
    const parked = await state.execution.releaseTurn("waiter", "owner", undefined);
    assert.ok(parked.wakeAt !== undefined && parked.wakeAt <= Date.now());
    assert.equal((await state.execution.acquireCapacity({ build: "waiter", command: "render", resources: [{ ...resource, units: 2 }], now: Date.now() })).status, "acquired");
    await state.execution.claim("waiter-owner");
    await state.execution.releaseTurn("waiter", "waiter-owner", Date.now() + 60_000);
    assert.equal((await state.execution.claim("later-owner"))?.build, "later");
    assert.equal((await state.execution.acquireCapacity({ build: "later", command: "render", resources: [resource], now: Date.now() })).status, "blocked");
    await state.execution.releaseTurn("later", "later-owner", undefined);
    assert.equal(await state.execution.claim("idle"), undefined);
    await state.execution.releaseCapacity("waiter", "render");
    assert.equal((await state.execution.claim("next"))?.build, "later");
  } finally { state.close(); await rm(directory, { recursive: true, force: true }); }
});
