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
import { FileBuildResultRepository } from "@hypit/result/node";
import type { BuildResultRepository } from "@hypit/result";
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
  publication,
  resultDestination,
  runFixture,
} from "./local-scenario.js";

test("project local Runtime advances, polls and cancels work with replaceable packages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-"));
  const buildFixture = createGreetingBuildFixture();
  const initial = buildFixture.state;
  const publishedOutputs = [{
    name: "final.document",
    ref: { kind: "logical-output" as const, id: "document" },
  }, {
    name: "prompt.text",
    ref: { kind: "logical-output" as const, id: "prompt" },
  }, {
    name: "generated.text",
    ref: { kind: "logical-output" as const, id: "generated" },
  }];
  const authoring = {
    sourcePath: join(directory, "main.svml"),
    publication: publication(publishedOutputs, buildFixture),
  };
  let promptCalls = 0;
  let requestCalls = 0;
  let assembleCalls = 0;
  let starts = 0;
  let polls = 0;
  let cancels = 0;
  const components: { producers: ProducerPackage; refinements?: RefinementPackage } = {
    producers: [
      {
        producer: producers.makePrompt,
        handler: ({ inputs }) => {
        promptCalls += 1;
        const intent = inputs.intent!;
        const name = (intent.value as { readonly name: string }).name;
        return { kind: "output", value: (`Greet ${name}`) };
        },
      },
      {
        producer: producers.requestText,
        handler: ({ inputs }) => {
        requestCalls += 1;
        return { kind: "need", constraints: { prompt: inputs.prompt!.value } };
        },
      },
      {
        producer: producers.placeholderText,
        handler: async ({ inputs }) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { kind: "output", value: (`Preview: ${inputs.prompt!.value}`) };
        },
      },
      {
        producer: producers.assemble,
        handler: ({ inputs }) => {
        assembleCalls += 1;
        return { kind: "output", value: ({ text: inputs.generated!.value }) };
        },
      },
    ],
  };
  const asyncEndpoint: AsyncEndpoint = {
    start({ operation }) {
      starts += 1;
      return { status: "pending" as const, handle: { remoteJob: operation }, wakeAt: Date.now() };
    },
    poll({ handle }) {
      polls += 1;
      assert.ok(handle);
      return {
        status: "completed",
        result: {
          value: ("Hello from durable local Runtime"),
        },
      };
    },
    cancel() {
      cancels += 1;
      return { status: "confirmed" };
    },
  };
  const endpointInstance: EndpointInstance = defineEndpoint({
    instance: "generation.personal",
    pool: "generation.personal",
    capabilities: [{
      lifecycle: "asynchronous",
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: asyncEndpoint,
    }],
  });

  let firstRuntime: Awaited<ReturnType<typeof createLocalRuntime>> | undefined;
  try {
    firstRuntime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      producers: components.producers,
      endpoints: [endpointInstance],
    });
    const first = await firstRuntime.build({
      id: "bld_20260902T120000001Z_0000000001",
      definition: definition(initial),
      authoring,
      result: resultDestination(directory),
    });
    assert("view" in first);
    assert.equal(first.view.activity, "ready");
    const firstTurn = await firstRuntime.workOnce();
    assert(firstTurn !== undefined && "wakeAt" in firstTurn);
    assert.equal(buildExecutionActivity(firstTurn), "ready");
    assert.equal(starts, 1);
    assert.equal(polls, 0);
    assert.equal("work" in firstRuntime, false, "execution lifecycle belongs to the Runtime Host");
    const otherRuntime = await createLocalRuntime({ ...projectRuntimeFixture(directory), producers: components.producers, endpoints:[endpointInstance] });
    try {
      assert.equal(await otherRuntime.workOnce(), undefined);
      await assert.rejects(otherRuntime.workOnce({build:"bld_20260902T120000001Z_0000000001"}), /another execution context/u);
      assert.equal(starts,1); assert.equal(polls,0);
    } finally { await otherRuntime.close(); }
    const second = await firstRuntime.inspect("bld_20260902T120000001Z_0000000001");
    assert.equal(second?.activity, "ready");
    assert.equal((await finishClaimedBuild(firstRuntime)).outcome, "complete");
    assert.equal(starts, 1);
    assert.equal(polls, 1);
    assert.equal(promptCalls, 1, "persisted Core facts stop deterministic upstream replay");
    assert.equal(requestCalls, 1, "the Need request Producer is also persisted");
    assert.equal(assembleCalls, 1);
    const clientStatus = await firstRuntime.inspect("bld_20260902T120000001Z_0000000001");
    assert.equal(clientStatus, undefined);
    assert.deepEqual((await firstRuntime.activity()).builds, []);
    const buildResult = await new FileBuildResultRepository(join(directory, "results"))
      .read("bld_20260902T120000001Z_0000000001");
    assert.deepEqual(Object.keys(buildResult?.outputs ?? {}).sort(), [
      "final.document",
      "generated.text",
      "prompt.text",
    ]);
    assert.deepEqual(buildResult?.targets, ["final.document"]);

    await firstRuntime.build(durableBuildRequest(directory, "bld_20260902T120000002Z_0000000001", createGreetingBuildFixture()));
    await firstRuntime.workOnce();
    await finishClaimedBuild(firstRuntime);
    const followed = await firstRuntime.inspect("bld_20260902T120000002Z_0000000001");
    assert.equal(followed, undefined);
    assert.equal(starts, 2);
    assert.equal(polls, 2);
    const followedStatus = await firstRuntime.inspect("bld_20260902T120000002Z_0000000001");
    assert.equal(followedStatus, undefined);

    const waiting = await firstRuntime.build(durableBuildRequest(directory, "bld_20260902T120000003Z_0000000001", createGreetingBuildFixture()));
    assert("view" in waiting);
    assert.equal(waiting.view.activity, "ready");
    await firstRuntime.workOnce();
    const requested = await firstRuntime.cancel("bld_20260902T120000003Z_0000000001");
    assert.equal(requested?.stop?.cause, "user-cancelled");
    const cancelled = await finishClaimedBuild(firstRuntime);
    assert.equal(cancelled.outcome, "cancelled");
    assert.equal(cancels, 1);
  } finally {
    await firstRuntime?.close();
    await rm(directory, { recursive: true, force: true });
  }
});


test("an immediate Command left in started state fails its Build without invoking the Producer again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-command-receipt-"));
  const buildFixture = createGreetingBuildFixture({ generationRealization: "placeholder" });
  const initial = buildFixture.state;
  let calls = 0;
  const components: { producers: ProducerPackage; refinements?: RefinementPackage } = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => {
        calls += 1;
        return { kind: "output", value: ("must not run") };
      },
    }],
  };
  let runtime: Awaited<ReturnType<typeof createLocalRuntime>> | undefined;
  try {
    runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      producers: components.producers,
    });
    const submitted = await runtime.build(durableBuildRequest(directory, "bld_20260902T120000008Z_0000000001", buildFixture));
    const command = submitted.state.outstanding[0];
    assert.ok(command);
    const state = new SqliteRuntimeState(join(directory, ".hypit", "runtime.sqlite"));
    await state.commandExecutions.begin("bld_20260902T120000008Z_0000000001", command.id);
    state.close();

    const terminal = await finishClaimedBuild(runtime);
    assert.equal(terminal.outcome, "failed");
    assert.equal(calls, 0);
    const failed = await new FileBuildResultRepository(join(directory, "results"))
      .read("bld_20260902T120000008Z_0000000001");
    assert.equal(failed?.outcome, "failed");
    assert.match(failed?.failure ?? "", /stopped before its result was stored/u);
  } finally {
    await runtime?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
