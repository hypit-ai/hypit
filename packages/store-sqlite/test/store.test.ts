import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { BuildMachine, defineBuild } from "@narratage/core";
import { SqliteRuntimeState } from "@narratage/store-sqlite";

import { createGreetingBuild } from "../../core/test/greeting-fixture.js";

test("read-only SQLite observation of an absent archive creates no file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-read-only-"));
  const path = join(directory, ".narratage", "runtime.sqlite");
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
test("SQLite stores verified Build facts and Operation handles across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-"));
  const path = join(directory, "runtime.sqlite");
  try {
    const first = new SqliteRuntimeState(path);
    const initial = createGreetingBuild();
    const definition = defineBuild(initial.program, initial.graph, initial.request);
    await first.builds.create("video", definition);
    const catalog = {
      source: { path: "/project/main.svml" },
      aliases: [{
        name: "final.video",
        ref: { kind: "logical-output", id: initial.request.targets[0]!.output },
      }],
    } as const;
    await first.catalog.record("video", catalog);
    assert.equal((await first.catalog.read("video"))?.aliases[0]?.name, "final.video");
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
    assert.equal((await second.catalog.read("video"))?.aliases[0]?.name, "final.video");
    assert.deepEqual((await second.catalog.list()).map((item) => item.build), ["video"]);
    const restoredOperation = await second.operations.read(operation.id);
    assert.equal(restoredOperation?.status, "pending");
    assert.deepEqual(restoredOperation?.handle, { remoteJob: "job-1" });
    assert.equal(restoredOperation?.wakeAt, 12_345);
    assert.deepEqual(restoredOperation?.progress, { phase: "generating" });
    assert.deepEqual((await second.operations.list({ build: "video" })).map((item) => item.id), [operation.id]);

    const machine = new BuildMachine(definition);
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
  const directory = await mkdtemp(join(tmpdir(), "narratage-operation-"));
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
test("cancelling a never-claimed Build atomically withdraws it from dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-cancel-queued-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    await state.dispatch.create({ build: "queued-build", componentPackages: [] }, { now: 100 });

    const cancelled = await state.dispatch.requestCancellation("queued-build", "no longer needed");
    assert.equal(cancelled.phase, "terminal");
    assert.equal(cancelled.terminal, "cancelled");
    assert.equal(cancelled.cancellation?.reason, "no longer needed");
    assert.equal(await state.dispatch.claim(102), undefined);
    assert.deepEqual(await state.dispatch.list({ phases: ["queued", "running", "waiting"] }), []);

    const repeated = await state.dispatch.requestCancellation("queued-build", "second reason");
    assert.deepEqual(repeated, cancelled);
    state.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Pool and Lane limits count only asynchronous Operations still in flight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-sqlite-hierarchy-"));
  try {
    const state = new SqliteRuntimeState(join(directory, "runtime.sqlite"));
    const pool = { id: "pool:kie.main", maxActive: 2, maxInFlight: 2 };
    const seedance = { id: "lane:kie.main/seedance-2-mini", maxActive: 1, maxInFlight: 1 };
    const minimax = { id: "lane:kie.main/minimax-h3", maxActive: 2, maxInFlight: 2 };

    const first = await state.dispatch.acquireCapacity({
      build: "seedance-a",
      command: "generate:a",
      resources: [pool, seedance],
      queue: { pool: "kie.main", lane: "seedance-2-mini" },
      now: 100,
    });
    assert.equal(first.status, "acquired");

    const sameRoute = await state.dispatch.acquireCapacity({
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

    const otherRoute = await state.dispatch.acquireCapacity({
      build: "minimax-a",
      command: "generate:c",
      resources: [pool, minimax],
      queue: { pool: "kie.main", lane: "minimax-h3" },
      now: 103,
    });
    assert.equal(otherRoute.status, "acquired");

    if (first.status === "acquired") {
      await state.dispatch.releaseCapacity(first.reservation.build, first.reservation.command);
    }
    const retried = await state.dispatch.acquireCapacity({
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
