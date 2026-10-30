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
import type { BuildResultStore } from "@hypit/result/runtime-storage";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { defineEndpoint } from "@hypit/endpoint";
import type { AsyncEndpoint, EndpointInstance } from "@hypit/endpoint";
import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerPackage } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import type { RefinementPackage } from "@hypit/refinement";
import { createLocalResultWriter, createLocalRuntime } from "@hypit/runtime-local";
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
  createParallelGreetingBuildFixture,
  manifest as greetingManifest,
  producers,
  types,
} from "../execution-scenario.js";

import {
  definition,
  durableBuildRequest,
  finishClaimedBuild,
  projectRuntimeFixture,
  resultIntent,
  resultDestination,
  runFixture,
} from "./local-scenario.js";

test("a completed retained file moves into its Build Result and leaves no Runtime working copy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-result-file-"));
  const id = "bld_20260902T120000004Z_0000000001";
  const workStore = new FileResourceStore(join(directory, ".hypit", "work", id));
  const initial = createGreetingBuild({ generationStep: "placeholder", targetOutputs: ["generated"] });
  const buildDefinition = definition(initial);
  const components: { producers: ProducerPackage; refinements?: RefinementPackage } = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => ({ kind: "output", value: ("make a clip") }),
    }, {
      producer: producers.placeholderText,
      handler: async () => ({ kind: "output", value: await workStore.put(new TextEncoder().encode("video bytes"), "video/mp4") }),
    }],
  };
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      producers: components.producers,
    });
    await runtime.build({
      id,
      definition: buildDefinition,
      authoring: {
        sourcePath: join(directory, "main.svml"),
        targets: ["clip.video"],
        intent: { outputs: [{ name: "clip.video",
          record: "generated:placeholder" }] },
      },
      result: resultDestination(directory),
    });
    assert.equal((await finishClaimedBuild(runtime)).outcome, "complete");
    const results = new FileBuildResultStore(join(directory, "results"));
    const result = await results.read(id);
    assert.equal(result?.outputs["clip.video"]?.value.kind, "build-file");
    const resolved = await results.resolve(id, "clip.video");
    assert.equal(resolved?.value.kind, "build-file");
    if (resolved?.value.kind !== "build-file") throw new Error("expected completed Result file");
    const opened = await results.openFile(id, resolved.value);
    if (opened === undefined) throw new Error("expected completed Result bytes");
    const resultBytes: number[] = [];
    for await (const chunk of opened) resultBytes.push(...chunk);
    assert.equal(new TextDecoder().decode(Uint8Array.from(resultBytes)), "video bytes");
    assert.equal(await stat(join(directory, ".hypit", "work", id)).then(() => true, () => false), false);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed Build keeps retained Outputs completed before removing active Runtime state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-bld_20260902T120000005Z_0000000001-"));
  const buildFixture = createGreetingBuildFixture();
  const initial = buildFixture.state;
  const components: { producers: ProducerPackage; refinements?: RefinementPackage } = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => ({ kind: "output", value: ("Greet Ada") }),
    }, {
      producer: producers.requestText,
      handler: ({ inputs }) => {
        return { kind: "need", constraints: { prompt: inputs.prompt!.value } };
      },
    }],
  };
  const endpoint = defineEndpoint({
    instance: "generation.failure",
    pool: "generation.failure",
    capabilities: [{
      lifecycle: "asynchronous",
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: {
        start: () => ({ status: "failed", failure: { code: "REMOTE_FAILED", message: "generation failed" } }),
        poll: () => { throw new Error("failed work is not polled"); },
      },
    }],
  });
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      producers: components.producers,
      endpoints: [endpoint],
    });
    await runtime.build({
      id: "bld_20260902T120000005Z_0000000001",
      definition: definition(initial),
      authoring: {
        sourcePath: join(directory, "main.svml"),
        targets: ["final.document"],
        intent: resultIntent([{
          name: "prompt.text", ref: { id: "prompt" },
        }, { name: "generated.text", ref: { id: "generated" } }, {
          name: "final.document", ref: { id: "document" },
        }], buildFixture),
      },
      result: resultDestination(directory),
    });
    assert.equal((await finishClaimedBuild(runtime)).outcome, "failed");
    const result = await new FileBuildResultStore(join(directory, "results"))
      .read("bld_20260902T120000005Z_0000000001");
    assert.equal(result?.outcome, "failed");
    assert.equal(result?.failure, "generation failed");
    assert.deepEqual(Object.keys(result?.outputs ?? {}), ["prompt.text"]);
    assert.deepEqual(result?.outputs["prompt.text"]?.value, { kind: "inline", value: "Greet Ada" });
    const status = await runtime.inspect("bld_20260902T120000005Z_0000000001");
    assert.equal(status, undefined);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const phase of ["submit", "poll"] as const) {
  test(`a ${phase} failure retains an already received sibling Output in the final Result`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hypit-local-sibling-result-"));
    const buildFixture = createParallelGreetingBuildFixture();
    const initial = buildFixture.state;
    let starts = 0;
    let polls = 0;
    const components: { producers: ProducerPackage; refinements?: RefinementPackage } = { producers: [
      { producer: producers.makePrompt, handler: () => ({ kind: "output", value: ("hello") }) },
      { producer: producers.requestText, handler: () => ({ kind: "need", constraints: {} }) },
    ] };
    const finish = async (id: number) => {
      if (id === 1) return { status: "failed" as const, failure: { code: "EXAMPLE_FAILURE", message: "first request failed" } };
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      return { status: "completed" as const, result: "retained sibling output" };
    };
    const endpoint = defineEndpoint({
      instance: "generation.siblings", pool: "generation.siblings", defaultConcurrency: 2,
      capabilities: [{ lifecycle: "asynchronous", capability: capabilities.generation, returns: types.generated, endpoint: {
        start() {
          const id = ++starts;
          return phase === "submit" ? finish(id) : { status: "pending", handle: { id }, receipt: { id: `task-${id}` }, wakeAt: Date.now() };
        },
        poll({ handle }) { polls++; return finish((handle as { id: number }).id); },
      } }],
    });
    const runtime = await createLocalRuntime({ ...projectRuntimeFixture(directory), producers: components.producers, endpoints: [endpoint] });
    try {
      const id = "bld_20260906T110000000Z_0000000001";
      await runtime.build(durableBuildRequest(directory, id, buildFixture));
      assert.equal((await finishClaimedBuild(runtime)).outcome, "failed");
      const result = await new FileBuildResultStore(join(directory, "results")).read(id);
      assert.equal(result?.failure, "first request failed");
      assert.deepEqual(result?.outputs["target.2"]?.value, { kind: "inline", value: "retained sibling output" });
      assert.equal(starts, 2);
      assert.equal(polls, phase === "submit" ? 0 : 2);
      assert.equal((await runtime.activity()).builds.length, 0);
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("an interrupted Result write can be retried internally without rerunning the Build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-result-retry-"));
  const initial = createGreetingBuild({ generationStep: "placeholder" });
  let generationCalls = 0;
  let rejectSync = true;
  const components: { producers: ProducerPackage; refinements?: RefinementPackage } = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => ({ kind: "output", value: ("Greet Ada") }),
    }, {
      producer: producers.placeholderText,
      handler: () => {
        generationCalls += 1;
        return { kind: "output", value: ("Hello") };
      },
    }, {
      producer: producers.assemble,
      handler: ({ inputs }) => {
        const generated = inputs.generated!.value;
        return { kind: "output", value: ({ text: generated }) };
      },
    }],
  };
  const fixture = projectRuntimeFixture(directory);
  const openRepository = async (
    location: import("@hypit/runtime-local").BuildResultRepositoryLocation,
  ) => {
    const base = new FileBuildResultStore(join(location.root, location.path));
    const repository: BuildResultStore = {
      create: async (seed) => await base.create(seed),
      async openWriter(build) {
        const writer = await base.openWriter(build);
        if (writer === undefined) return undefined;
        return {
          read: async () => await writer.read(),
          sync: async (input) => {
            if (rejectSync) throw new Error("result store unavailable");
            return await writer.sync(input);
          },
          finish: async (input) => await writer.finish(input),
        };
      },
      removeIncomplete: async (build) => await base.removeIncomplete(build),
      read: async (build) => await base.read(build),
      readStored: async (build) => await base.readStored(build),
      browse: async (request) => await base.browse(request),
      resolve: async (build, output) => await base.resolve(build, output),
      openFile: async (build, file) => await base.openFile(build, file),
    };
    return { repository };
  };
  try {
    const runtime = await createLocalRuntime({
      ...fixture,
      openBuildResultRepository: openRepository,
      producers: components.producers,
    });
    await runtime.build({
      id: "bld_20260902T120000006Z_0000000001",
      definition: definition(initial),
      authoring: {
        sourcePath: join(directory, "main.svml"),
        targets: ["final.document"],
        intent: { outputs: [{ name: "final.document",
          record: "document:root" }] },
      },
      result: resultDestination(directory),
    });
    const blocked = await runtime.workOnce();
    assert(blocked !== undefined && "decision" in blocked);
    assert.deepEqual(blocked.attention, { step: "result", error: "result store unavailable" });
    assert.equal(generationCalls, 1);
    assert.equal(await runtime.workOnce(), undefined);

    rejectSync = false;
    const resultWriter = createLocalResultWriter({ ...fixture, openBuildResultRepository: openRepository });
    const completed = await resultWriter.completeResult(blocked);
    assert.ok(!("createdAt" in completed));
    assert.equal(completed.outcome, "complete");
    assert.equal(generationCalls, 1);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed Result creation leaves no active Build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-submit-rollback-"));
  const initial = createGreetingBuild({ generationStep: "placeholder" });
  const fixture = projectRuntimeFixture(directory);
  const unavailable: BuildResultStore = {
    async create() { throw new Error("result repository refused creation"); },
    async openWriter() { return undefined; },
    async removeIncomplete() {},
    async read() { return undefined; },
    async readStored() { return undefined; },
    async browse() { return { results: [] }; },
    async resolve() { return undefined; },
    async openFile() { return undefined; },
  };
  try {
    const runtime = await createLocalRuntime({
      ...fixture,
      openBuildResultRepository: async () => ({ repository: unavailable }),
    });
    await assert.rejects(runtime.build({
      id: "bld_20260902T120000007Z_0000000001",
      definition: definition(initial),
      authoring: {
        sourcePath: join(directory, "main.svml"),
        targets: ["final.document"],
        intent: { outputs: [{ name: "final.document",
          record: "document:root" }] },
      },
      result: resultDestination(directory),
    }), /result repository refused creation/u);
    const status = await runtime.inspect("bld_20260902T120000007Z_0000000001");
    assert.equal(status, undefined);
    assert.equal(await runtime.workOnce(), undefined);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
