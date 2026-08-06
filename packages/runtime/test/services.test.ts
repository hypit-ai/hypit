import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@svml/protocol";
import {
  MemoryBuildStore,
  MemoryOperationStore,
  assembleRuntimeServices,
  defineRuntimeServicePackage,
  verifyRuntimeServicePackage,
} from "@svml/runtime";

const moduleRef = { name: "example.runtime-services", version: "1" } as const;

function servicePackage(close?: () => void) {
  return defineRuntimeServicePackage({
    name: "example.runtime-services.local",
    module: moduleRef,
    services: [
      {
        role: "scheduler",
        facet: "scheduler",
        instance: "scheduler.example",
        implementation: {
          locator: "example.runtime-services/scheduler",
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
        role: "build-store",
        facet: "build-store",
        instance: "builds.example",
        implementation: {
          locator: "example.runtime-services/build-store",
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
          locator: "example.runtime-services/operation-store",
          digest: digestOf("example.runtime-services/operation-store@1"),
        },
        configuration: { database: "fixture" },
        service: new MemoryOperationStore(),
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
    stores: {
      build: "builds.example",
      operations: "operations.example",
    },
  });
  assert.equal(assembly.manifests.length, 1);
  assert.deepEqual(assembly.instances.map((item) => item.id), [
    "scheduler.example",
    "builds.example",
    "operations.example",
  ]);
  assert.ok(assembly.buildStore);
  assert.ok(assembly.operationStore);
  assert.equal(assembly.artifactStore, undefined);
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
      stores: {},
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
