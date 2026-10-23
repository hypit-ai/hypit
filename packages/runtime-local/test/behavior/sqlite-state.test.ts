import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { BuildMachine, defineBuild, materializeBuild } from "@hypit/kernel";
import type { OperationSnapshot } from "@hypit/runtime";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";

import { capabilities, createGreetingBuild, types } from "../execution-scenario.js";

const resultLocation = {
  root: "/project",
  path: ".hypit/results",
} as const;

const operationContext = {
  createdAt: 1,
  need: {
    id: "need:test",
    capability: capabilities.generation,
    returns: types.generated,
    constraints: null,
    result: "record:test",
  },
  credentials: {},
} as const;

test("local command progress is visible across connections and ends with the command", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-command-progress-"));
  const path = join(directory, "runtime.sqlite");
  const writer = new SqliteRuntimeState(path);
  const observer = new SqliteRuntimeState(path, { readOnly: true });
  try {
    await writer.commandExecutions.begin("build", "draw");
    await writer.commandExecutions.reportProgress("build", "draw", {
      endpoint: "example.local", progress: { phase: "drawing", completed: 5, total: 10, unit: "frames" },
    });
    assert.equal((await observer.commandExecutions.list("build"))[0]?.activity?.progress.completed, 5);
    await writer.commandExecutions.complete("build", "draw", { kind: "command-failed", command: "draw", code: "STOP", message: "Stopped" });
    await writer.commandExecutions.reportProgress("build", "draw", { endpoint: "example.local", progress: { phase: "late" } });
    assert.equal((await observer.commandExecutions.list("build"))[0]?.activity, undefined);
    assert.deepEqual(await observer.operations.list({ build: "build" }), []);
  } finally {
    observer.close(); writer.close(); await rm(directory, { recursive: true, force: true });
  }
});

function definition(state: ReturnType<typeof createGreetingBuild>) {
  return defineBuild({
    program: state.program,
    plan: state.plan,
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
      sourcePath: "/project/main.svml",
      publication: { outputs: [{
        name: "final.video",
        output: "document",
        target: true,
        type: types.document,
        source: { kind: "current-record", record: "document:root" },
      }] },
    } as const;
    await first.catalog.record("video", catalog);
    assert.equal((await first.catalog.read("video"))?.publication.outputs[0]?.name, "final.video");
    const operation = {
      id: "operation:generation",
      build: "video",
      command: "command:generation",
      endpoint: "images.personal",
    };
    const pending = await first.operations.create({ ...operation,
      ...operationContext,
      status: "running",
      handle: { remoteJob: "job-1" },
      acknowledgedAt: 2,
      wakeAt: 12_345,
      progress: { phase: "generating" },
    });
    assert.equal(pending.status, "running");
    first.close();

    const second = new SqliteRuntimeState(path);
    const restoredBuild = await second.builds.read("video");
    assert.ok(restoredBuild);
    assert.equal(materializeBuild(restoredBuild.definition, restoredBuild.facts).status, initial.status);
    assert.equal((await second.catalog.read("video"))?.publication.outputs[0]?.name, "final.video");
    const restoredOperation = await second.operations.read(operation.id);
    assert.equal(restoredOperation?.status, "running");
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
      endpoint: "html.remote",
    };
    const completed = await state.operations.create({ ...identity,
      ...operationContext,
      status: "completed",
      acknowledgedAt: 2,
      endedAt: 3,
      value: {
        artifact: "video.mp4",
      },
    });
    assert.equal(completed.status, "completed");
    assert.equal((await state.operations.read(identity.id))?.status, "completed");
    assert.equal((await state.operations.update(identity.id, {
      status: "queued",
    })).status, "completed");
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function operationBranches(): readonly OperationSnapshot[] {
  const identity = (status: string) => ({
    id: `operation:${status}`,
    build: "video",
    command: `command:${status}`,
    endpoint: "example.remote",
    ...operationContext,
  });
  return [
    { ...identity("queued"), status: "queued", wakeAt: 10 },
    { ...identity("submitting"), status: "submitting" },
    { ...identity("running"), status: "running", handle: { job: "running" }, acknowledgedAt: 11, wakeAt: 12 },
    { ...identity("collecting"), status: "collecting", handle: { job: "collecting" }, acknowledgedAt: 13, endedAt: 14, wakeAt: 15 },
    { ...identity("received"), status: "received", value: "received", acknowledgedAt: 16, endedAt: 17 },
    { ...identity("completed"), status: "completed", value: "completed", acknowledgedAt: 18, endedAt: 19 },
    { ...identity("failed"), status: "failed", failure: { code: "REMOTE", message: "failed" }, endedAt: 20 },
    { ...identity("cancelled"), status: "cancelled", cancellation: { outcome: "confirmed" }, endedAt: 21 },
  ];
}

test("SQLite reconstructs every Operation status as its exact union branch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-operation-union-"));
  const path = join(directory, "runtime.sqlite");
  try {
    const writer = new SqliteRuntimeState(path);
    for (const operation of operationBranches()) await writer.operations.create(operation);
    writer.close();
    const reader = new SqliteRuntimeState(path, { readOnly: true });
    for (const operation of operationBranches()) {
      assert.deepEqual(await reader.operations.read(operation.id), operation);
    }
    reader.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite refuses Operation payload fields from another status branch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-operation-branch-"));
  const path = join(directory, "runtime.sqlite");
  try {
    const writer = new SqliteRuntimeState(path);
    for (const operation of operationBranches()) await writer.operations.create(operation);
    writer.close();
    const database = new DatabaseSync(path);
    const corruptions = [
      ["queued", "completion", { value: null }],
      ["submitting", "handle", { job: "wrong-phase" }],
      ["running", "failure", { code: "WRONG", message: "wrong phase" }],
      ["collecting", "cancellation", { outcome: "confirmed" }],
      ["received", "wakeAt", 99],
      ["completed", "handle", { job: "wrong-phase" }],
      ["failed", "completion", { value: null }],
      ["cancelled", "failure", { code: "WRONG", message: "wrong phase" }],
    ] as const;
    for (const [status, field, value] of corruptions) {
      const id = `operation:${status}`;
      const row = database.prepare("SELECT payload_json FROM hypit_operations WHERE operation_id = ?")
        .get(id) as { readonly payload_json: string };
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      database.prepare("UPDATE hypit_operations SET payload_json = ? WHERE operation_id = ?")
        .run(JSON.stringify({ ...payload, [field]: value }), id);
      const reader = new SqliteRuntimeState(path, { readOnly: true });
      await assert.rejects(reader.operations.read(id), /unexpected field/u);
      reader.close();
      database.prepare("UPDATE hypit_operations SET payload_json = ? WHERE operation_id = ?")
        .run(row.payload_json, id);
    }
    database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite requires the facts owned by each stateful Operation branch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-operation-required-"));
  const path = join(directory, "runtime.sqlite");
  try {
    const writer = new SqliteRuntimeState(path);
    for (const operation of operationBranches()) await writer.operations.create(operation);
    writer.close();
    const database = new DatabaseSync(path);
    const omissions = [
      ["running", "handle"],
      ["collecting", "endedAt"],
      ["received", "value"],
      ["completed", "acknowledgedAt"],
      ["failed", "failure"],
      ["cancelled", "cancellation"],
    ] as const;
    for (const [status, field] of omissions) {
      const id = `operation:${status}`;
      const row = database.prepare("SELECT payload_json FROM hypit_operations WHERE operation_id = ?")
        .get(id) as { readonly payload_json: string };
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      delete payload[field];
      database.prepare("UPDATE hypit_operations SET payload_json = ? WHERE operation_id = ?")
        .run(JSON.stringify(payload), id);
      const reader = new SqliteRuntimeState(path, { readOnly: true });
      await assert.rejects(reader.operations.read(id), /SQLite .*Operation/u);
      reader.close();
      database.prepare("UPDATE hypit_operations SET payload_json = ? WHERE operation_id = ?")
        .run(row.payload_json, id);
    }
    database.close();
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
      state.submissions.prepare({ build: "existing-build", executionPackages: [], result: resultLocation }),
      /already has Runtime state/u,
    );
    await state.submissions.discard("existing-build");
    assert.notEqual(await state.builds.read("existing-build"), undefined);

    const submission = await state.submissions.prepare({
      build: "new-build",
      executionPackages: ["example.component@1"],
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
    const result = { root: "/projects/episode-12", path: ".hypit/results" } as const;
    const initial = createGreetingBuild();
    const buildDefinition = definition(initial);
    const request = {
      build: "queued-build",
      executionPackages: ["example.component@1"],
      result,
      context: { z: 2, a: 1 },
    } as const;
    await state.submissions.prepare(request, { now: 100 });
    await state.submissions.commit({
      ...request,
      definition: buildDefinition,
      catalog: { sourcePath: "/project/main.svml", publication: { outputs: [] } },
    });
    assert.equal(await state.submissions.read("queued-build"), undefined);
    assert.deepEqual((await state.execution.read("queued-build"))?.result, result);

    const cancelling = await state.execution.requestStop("queued-build", { cause: "user-cancelled", reason: "no longer needed" });
    assert.equal(cancelling.stop?.reason, "no longer needed");
    const claimed = await state.execution.claim("worker-a", Date.now());
    assert.equal(claimed?.turn?.owner, "worker-a");
    const decided = await state.execution.decide("queued-build", "worker-a", { outcome: "cancelled", reason: "no longer needed" });
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

test("each execution retains its own context and can be claimed without touching its sibling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-context-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    await state.execution.create({ build: "a", executionPackages: [], result: resultLocation, context: { provider: "old" } }, { now: 100 });
    await state.execution.create({ build: "b", executionPackages: [], result: resultLocation, context: { provider: "new" } }, { now: 100 });
    await state.execution.start("a", 101);
    await assert.rejects(state.execution.start("a", 102), /already started/u);
    assert.equal((await state.execution.claim("b-owner", 102, "b"))?.build, "b");
    assert.equal((await state.execution.read("a"))?.turn, undefined);
    assert.deepEqual((await state.execution.read("a"))?.context, { provider: "old" });
    const interrupted = await state.execution.interrupt("a", "executor exited");
    assert.equal(interrupted.decision?.outcome, "failed");
    assert.equal((await state.execution.read("b"))?.turn?.owner, "b-owner");
    state.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a lost executor ends its attempt while Result-writer leases can be reclaimed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-sqlite-turn-reclaim-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    await state.execution.create({ build: "interrupted", executionPackages: [], result: resultLocation }, { now: 100 });
    assert.equal((await state.execution.claim("old-worker", 100))?.turn?.owner, "old-worker");
    await state.execution.interrupt("interrupted", "executor lost");
    assert.equal((await state.execution.read("interrupted"))?.turn, undefined);
    assert.equal(await state.execution.claim("new-worker", 200), undefined);
    assert.equal((await state.execution.read("interrupted"))?.decision?.outcome, "failed");
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
    const pool = { id: "pool:images.main", limit: 2 };
    const seedance = { id: "capacity:images.main/seedance-2-mini", limit: 1 };
    const minimax = { id: "capacity:images.main/minimax-h3", limit: 2 };

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
    await state.execution.create({ build: "fresh", executionPackages: [], result: resultLocation }, { now: 100 });
    await state.execution.create({ build: "in-flight", executionPackages: [], result: resultLocation }, { now: 101 });
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
    await state.execution.create({ build: "stopping", executionPackages: [], result: resultLocation });
    await state.execution.claim("worker");
    const stop = { cause: "execution-failed" as const, reason: "original failure" };
    await state.execution.requestStop("stopping", stop);
    assert.deepEqual((await state.execution.requestStop("stopping", { cause: "user-cancelled", reason: "later" })).stop, stop);
    const wakeAt = Date.now() + 60_000;
    const unaware = await state.execution.releaseTurn("stopping", "worker", wakeAt);
    assert.ok(unaware.wakeAt! <= Date.now(), "a stop received during execution must be processed promptly");
    await state.execution.claim("worker");
    assert.deepEqual((await state.execution.decide("stopping", "worker", { outcome: "cancelled", reason: "later" })).decision,
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

test("shared action rates carry elapsed balance across policy changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-rate-policy-"));
  const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
  try {
    const acquire = (build: string, limit: number, periodMs: number, now: number) => state.execution.acquireCapacity({
      build,
      command: "submit",
      resources: [{ id: "rate:account/submit", limit, periodMs }],
      now,
    });
    assert.equal((await acquire("old-a", 2, 1_000, 0)).status, "acquired");
    assert.equal((await acquire("old-b", 2, 1_000, 0)).status, "acquired");
    const changed = await acquire("new-a", 4, 1_000, 250);
    assert.equal(changed.status, "blocked");
    assert.equal(changed.status === "blocked" && changed.availableAt, 375,
      "elapsed balance uses the old policy and future refill uses the new one");
    assert.equal((await acquire("new-a", 4, 1_000, 375)).status, "acquired");

    assert.equal((await acquire("capped", 1, 1_000, 375)).status, "blocked",
      "lowering the limit does not manufacture balance above the new cap");
  } finally {
    state.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a resource release before parking is observed and later releases wake a fitting waiter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-capacity-wakeup-"));
  const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
  const resource = { id: "browsers", limit: 2 };
  const destination = { root: directory, path: "results" };
  try {
    for (const [now, build] of ["holder", "waiter", "later"].entries()) {
      await state.execution.create({ build, executionPackages: [], result: destination }, { now });
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
