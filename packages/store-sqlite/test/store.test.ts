import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { digestOf } from "@narratage/core";
import {
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
        conformance: "exact",
        delivery: "executed",
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

test("Host Catalog schema changes do not change the execution Runtime Closure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-sqlite-closure-"));
  try {
    const services = createSqliteRuntimeServicePackage({ path: join(directory, "runtime.sqlite") });
    assert.deepEqual(
      services.services.map((item) => item.instance.configurationDigest),
      [
        digestOf({ path: join(directory, "runtime.sqlite"), schemaVersion: 1, busyTimeoutMs: 5_000 }),
        digestOf({ path: join(directory, "runtime.sqlite"), schemaVersion: 1, busyTimeoutMs: 5_000 }),
      ],
    );
    await services.close?.();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
