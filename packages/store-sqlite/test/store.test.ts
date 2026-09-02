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
      pool: "kie.personal",
      lane: "fixture.generation",
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
      pool: "hyperframes.lambda",
      lane: "fixture.render",
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

    const cancelling = await state.execution.requestCancellation("queued-build", "no longer needed");
    assert.equal(cancelling.cancellation?.reason, "no longer needed");
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

test("Pool and Lane limits count only asynchronous Operations still in flight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-hierarchy-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const pool = { id: "pool:kie.main", limit: 2 };
    const seedance = { id: "lane:kie.main/seedance-2-mini", limit: 1 };
    const minimax = { id: "lane:kie.main/minimax-h3", limit: 2 };

    const first = await state.execution.acquireCapacity({
      build: "seedance-a",
      command: "generate:a",
      resources: [pool, seedance],
      queue: { pool: "kie.main", lane: "seedance-2-mini" },
      now: 100,
    });
    assert.equal(first.status, "acquired");

    const sameRoute = await state.execution.acquireCapacity({
      build: "seedance-b",
      command: "generate:b",
      resources: [pool, seedance],
      queue: { pool: "kie.main", lane: "seedance-2-mini" },
      now: 102,
    });
    assert.deepEqual(sameRoute, {
      status: "blocked",
      availableAt: 352,
      reason: "resource-in-flight",
      resource: seedance.id,
    });

    const otherRoute = await state.execution.acquireCapacity({
      build: "minimax-a",
      command: "generate:c",
      resources: [pool, minimax],
      queue: { pool: "kie.main", lane: "minimax-h3" },
      now: 103,
    });
    assert.equal(otherRoute.status, "acquired");

    if (first.status === "acquired") {
      await state.execution.releaseCapacity(first.reservation.build, first.reservation.command);
    }
    const retried = await state.execution.acquireCapacity({
      build: "seedance-b",
      command: "generate:b",
      resources: [pool, seedance],
      queue: { pool: "kie.main", lane: "seedance-2-mini" },
      now: 104,
    });
    assert.equal(retried.status, "acquired");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
