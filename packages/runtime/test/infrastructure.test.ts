import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoryBuildStore,
  MemoryOperationStore,
  assembleRuntimeInfrastructure,
  defineRuntimeInfrastructurePackage,
  verifyRuntimeInfrastructurePackage,
} from "@narratage/runtime";

const moduleRef = { name: "example.infrastructures", version: "1" } as const;

function servicePackage(close?: () => void) {
  return defineRuntimeInfrastructurePackage({
    module: moduleRef,
    instance: "example",
    parts: [
      {
        role: "scheduler",
        facet: "scheduler",
        part: "scheduler",
        port: {
          create() {
            return { async run() { return []; } };
          },
        },
      },
      {
        role: "worker",
        facet: "worker",
        part: "worker",
        port: { create() { return { async runOnce() { return undefined; }, async run() {} }; } },
      },
      {
        role: "build-store",
        facet: "build-store",
        part: "builds",
        port: new MemoryBuildStore(),
      },
      {
        role: "operation-store",
        facet: "operation-store",
        part: "operations",
        port: new MemoryOperationStore(),
      },
      {
        role: "dispatch-store",
        facet: "dispatch-store",
        part: "dispatch",
        port: Object.fromEntries([
          "create", "read", "list", "wake", "claim", "release", "finish", "requestCancellation",
          "acquireCapacity", "releaseCapacity", "releaseBuildCapacity", "listCapacity",
        ].map((name) => [name, async () => undefined])) as never,
      },
      {
        role: "artifact-store",
        facet: "artifact-store",
        part: "artifacts",
        port: {
          async put() { throw new Error("unused"); },
          async get() { return undefined; },
          async has() { return false; },
        },
      },
      {
        role: "credential-store",
        facet: "credential-store",
        part: "credentials",
        port: { async resolve() { return undefined; } },
      },
    ],
    ...(close === undefined ? {} : { close }),
  });
}

test("one physical Runtime package exposes separately selected Scheduler and Store parts", async () => {
  let closes = 0;
  const configured = servicePackage(() => { closes += 1; });
  const assembly = assembleRuntimeInfrastructure([configured], {
    scheduler: { from: "example", part: "scheduler" },
    worker: { from: "example", part: "worker" },
    buildStore: { from: "example", part: "builds" },
    operationStore: { from: "example", part: "operations" },
    dispatchStore: { from: "example", part: "dispatch" },
    artifactStore: { from: "example", part: "artifacts" },
    credentialStores: [{ from: "example", part: "credentials" }],
  });
  assert.equal(assembly.manifests.length, 1);
  assert.deepEqual(assembly.instances.map((item) => item.id), [
    "example.scheduler",
    "example.worker",
    "example.builds",
    "example.operations",
    "example.dispatch",
    "example.artifacts",
    "example.credentials",
  ]);
  assert.ok(assembly.buildStore);
  assert.ok(assembly.operationStore);
  assert.ok(assembly.artifactStore);
  assert.equal((await assembly.scheduler.create({
    prepare() { throw new Error("unused"); },
    async executeCommand() { throw new Error("unused"); },
  }).run([])).length, 0);
  await assembly.close();
  await assembly.close();
  assert.equal(closes, 1);
});

test("Runtime infrastructure role selection is exact", () => {
  const configured = servicePackage();
  assert.throws(
    () => assembleRuntimeInfrastructure([configured], {
      scheduler: { from: "example", part: "builds" },
      worker: { from: "example", part: "worker" },
      buildStore: { from: "example", part: "builds" },
      operationStore: { from: "example", part: "operations" },
      dispatchStore: { from: "example", part: "dispatch" },
      artifactStore: { from: "example", part: "artifacts" },
      credentialStores: [{ from: "example", part: "credentials" }],
    }),
    /not scheduler/u,
  );

  const inconsistent = {
    ...configured,
    manifest: structuredClone(configured.manifest),
    parts: [...configured.parts],
  };
  (inconsistent.manifest.facets[1] as { role: "artifact-store" }).role = "artifact-store";
  assert.throws(() => verifyRuntimeInfrastructurePackage(inconsistent), /role differs/u);

  const missingPort = {
    ...configured,
    parts: configured.parts.map((part) => part.role === "build-store"
      ? { ...part, port: {} as never }
      : part),
  };
  assert.throws(() => verifyRuntimeInfrastructurePackage(missingPort), /does not implement create/u);
});
