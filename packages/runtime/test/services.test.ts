import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/protocol";
import {
  MemoryBuildStore,
  MemoryOperationStore,
  assembleRuntimeServices,
  defineRuntimeServicePackage,
  verifyRuntimeServicePackage,
} from "@narratage/runtime";

const moduleRef = { name: "example.runtime-services", version: "1" } as const;

function servicePackage(close?: () => void) {
  return defineRuntimeServicePackage({
    module: moduleRef,
    services: [
      {
        role: "scheduler",
        facet: "scheduler",
        instance: "scheduler.example",
        implementation: {
          digest: digestOf("example.runtime-services/scheduler@1"),
        },
        configuration: { algorithm: "fixture" },
        service: {
          create() {
            return { async run() { return []; } };
          },
        },
      },
      {
        role: "worker",
        facet: "worker",
        instance: "worker.example",
        implementation: { digest: digestOf("worker") },
        service: { create() { return { async runOnce() { return undefined; }, async run() {} }; } },
      },
      {
        role: "build-store",
        facet: "build-store",
        instance: "builds.example",
        implementation: {
          digest: digestOf("example.runtime-services/build-store@1"),
        },
        configuration: { database: "fixture" },
        service: new MemoryBuildStore(),
      },
      {
        role: "operation-store",
        facet: "operation-store",
        instance: "operations.example",
        implementation: {
          digest: digestOf("example.runtime-services/operation-store@1"),
        },
        configuration: { database: "fixture" },
        service: new MemoryOperationStore(),
      },
      {
        role: "dispatch-store",
        facet: "dispatch-store",
        instance: "dispatch.example",
        implementation: { digest: digestOf("dispatch") },
        service: Object.fromEntries([
          "create", "read", "list", "wake", "claim", "heartbeat", "release", "finish", "requestCancellation",
          "acquireCapacity", "heartbeatCapacity", "parkCapacity", "releaseCapacity", "clearCapacity", "listCapacity",
        ].map((name) => [name, async () => undefined])) as never,
      },
      {
        role: "artifact-store",
        facet: "artifact-store",
        instance: "artifacts.example",
        implementation: { digest: digestOf("artifacts") },
        service: {
          async put() { throw new Error("unused"); },
          async get() { return undefined; },
          async has() { return false; },
        },
      },
      {
        role: "credential-store",
        facet: "credential-store",
        instance: "credentials.example",
        implementation: { digest: digestOf("credentials") },
        service: { async resolve() { return undefined; } },
      },
    ],
    ...(close === undefined ? {} : { close }),
  });
}

test("one physical Runtime package exposes separately selected Scheduler and Store services", async () => {
  let closes = 0;
  const configured = servicePackage(() => { closes += 1; });
  const assembly = assembleRuntimeServices([configured], {
    scheduler: "scheduler.example",
    worker: "worker.example",
    stores: {
      build: "builds.example",
      operations: "operations.example",
      dispatch: "dispatch.example",
      artifacts: "artifacts.example",
      credentials: ["credentials.example"],
    },
  });
  assert.equal(assembly.manifests.length, 1);
  assert.deepEqual(assembly.instances.map((item) => item.id), [
    "scheduler.example",
    "worker.example",
    "builds.example",
    "operations.example",
    "dispatch.example",
    "artifacts.example",
    "credentials.example",
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

test("Runtime service configuration is identity-bound and role selection is exact", () => {
  const configured = servicePackage();
  assert.ok(configured.services.every((item) => item.instance.configurationDigest !== undefined));
  assert.throws(
    () => assembleRuntimeServices([configured], {
      scheduler: "builds.example",
      worker: "worker.example",
      stores: {
        build: "builds.example",
        operations: "operations.example",
        dispatch: "dispatch.example",
        artifacts: "artifacts.example",
        credentials: ["credentials.example"],
      },
    }),
    /not scheduler/u,
  );

  const tampered = {
    ...configured,
    manifest: structuredClone(configured.manifest),
    services: [...configured.services],
  };
  (tampered.manifest.facets[1] as { role: "artifact-store" }).role = "artifact-store";
  assert.throws(() => verifyRuntimeServicePackage(tampered), /role differs/u);

  const missingPort = {
    ...configured,
    services: configured.services.map((service) => service.role === "build-store"
      ? { ...service, service: {} as never }
      : service),
  };
  assert.throws(() => verifyRuntimeServicePackage(missingPort), /does not implement create/u);
});
