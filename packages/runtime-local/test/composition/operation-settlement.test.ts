import { fileExecutionLogs } from "../../src/log.js";
import { readExecutionLog } from "@hypit/runtime";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { FileResourceStore } from "../../src/resource-store.js";
import { FileBuildResultStore } from "@hypit/result/runtime-storage/node";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { defineEndpoint } from "@hypit/endpoint";
import type { AsyncEndpoint, EndpointInstance } from "@hypit/endpoint";
import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerPackage } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import type { RefinementPackage } from "@hypit/refinement";
import { createLocalRuntime } from "@hypit/runtime-local";
import { resolveProjectRoot } from "@hypit/project";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";
import { defineBuild, link } from "@hypit/kernel";
import { loadNodePackageSelection } from "@hypit/loader/node";
import { credentialRef } from "@hypit/runtime";
import { buildExecutionActivity } from "@hypit/runtime-local";
import type { BuildCompletion } from "@hypit/runtime-local";
import type { CredentialValue, WritableCredentialStore } from "@hypit/runtime";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";

import {
  capabilities,
  createGreetingBuild,
  createGreetingBuildFixture,
  createParallelGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../execution-scenario.js";

import {
  definition,
  durableBuildRequest,
  finishClaimedBuild,
  projectRuntimeFixture,
  resultDestination,
  runFixture,
} from "./local-scenario.js";

for (const cancellation of ["accepted", "unsupported", "failed-build", "host-failure"] as const) {
  test(`${cancellation} finishes the Build with receipts without waiting for remote termination`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hypit-settlement-"));
    let fixture = projectRuntimeFixture(directory);
    let failRead = false;
    let remoteActive = 0, starts = 0, cancels = 0, polls = 0;
    const provider = defineEndpoint({ instance: "settlement",
      pool: "shared", defaultConcurrency: 1, capabilities: [{ capability: capabilities.generation, returns: types.generated,
        lifecycle: "asynchronous", endpoint: {
          start() { starts++; remoteActive++; return { status: "pending", handle: { job: starts }, receipt: { id: `job-${starts}` }, wakeAt: Date.now() + 60_000 }; },
          poll() { polls++; throw new Error("stopped Builds must not poll"); },
          cancel() { cancels++; return { status: cancellation === "accepted" ? "accepted" : "unsupported" }; },
        } }] });
    const openRuntime = () => createLocalRuntime({ ...fixture, endpoints: [provider],
      buildStore: {
        create: (...args) => fixture.buildStore.create(...args),
        append: (...args) => fixture.buildStore.append(...args),
        read: async (build) => {
          if (failRead) { failRead = false; throw new Error("Runtime read interrupted"); }
          return await fixture.buildStore.read(build);
        },
      }, producers: [
      { producer: producers.makePrompt, handler: () => ({ kind: "output", value: ("hello") }) },
      { producer: producers.requestText, handler: () => ({ kind: "need", constraints: { prompt: "hello" } }) },
    ] });
    let runtime = await openRuntime();
    try {
      const first = "bld_20260905T120000001Z_0000000001";
      const second = "bld_20260905T120000002Z_0000000001";
      const buildFixture = createGreetingBuildFixture({ targetOutputs: ["generated"] });
      const initial = buildFixture.state;
      await runtime.build(durableBuildRequest(directory, first, buildFixture));
      await runtime.workOnce();
      if (cancellation === "failed-build" || cancellation === "host-failure") {
        if (cancellation === "failed-build") {
          const snapshot = (await fixture.buildStore.read(first))!;
          const { BuildMachine } = await import("@hypit/kernel");
          const machine = new BuildMachine(snapshot.definition, snapshot.facts);
          const operation = (await fixture.operationStore.list({ build: first }))[0]!;
          const fact = machine.evaluate({ kind: "command-failed", command: operation.command, code: "EXAMPLE_FAILURE", message: "a sibling failed" });
          assert.ok(fact); await fixture.buildStore.append(first, fact);
        } else { failRead = true; }
        await fixture.executionStore.claim("test-wake", Date.now() + 60_001);
        await fixture.executionStore.releaseTurn(first, "test-wake", Date.now());
      } else { await runtime.cancel(first); }
      const completion = await runtime.workOnce();
      const isFailure = cancellation === "failed-build" || cancellation === "host-failure";
      assert.ok(completion !== undefined && "outcome" in completion);
      assert.equal(completion.outcome, isFailure ? "failed" : "cancelled");
      assert.equal((await fixture.executionStore.listCapacity()).length, 0);
      assert.equal(await runtime.inspect(first), undefined);
      const result = await new FileBuildResultStore(join(directory, "results")).read(first);
      assert.equal(result?.outcome, completion.outcome);
      assert.equal(result?.operations?.[0]?.receipt?.id, "job-1");
      assert.equal(result?.operations?.[0]?.outcome, isFailure ? undefined : "cancelled");
      assert.equal(polls, 0);
      assert.equal(cancels, isFailure ? 0 : 1);
      assert.equal(remoteActive, 1, "local termination does not pretend the cloud task stopped");
      await runtime.build(durableBuildRequest(directory, second, buildFixture));
      await runtime.workOnce();
      assert.equal(starts, 2, "a new Build can perform its own execution attempt");
    } finally { await runtime.close(); await rm(directory, { recursive: true, force: true }); }
  });
}
