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

import { FileResourceStore } from "@hypit/resource-store/node";
import { FileRunFinalizationStore } from "../../src/result-storage/index.js";
import type { RunFinalizationStore } from "../../src/result-storage/index.js";
import { FileBuildResultHistory } from "@hypit/result/node";
import { FileProductHistory } from "@hypit/product/node";
import { isBlobRef } from "@hypit/protocol";
import { EnvironmentCredentialStore } from "./environment-credential-store.js";
import { defineEndpoint } from "@hypit/endpoint";
import type { AsyncEndpoint, EndpointInstance } from "@hypit/endpoint";
import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerPackage } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import type { RefinementPackage } from "@hypit/refinement";
import { createLocalRunFinalizer, createLocalRuntime } from "@hypit/runtime-local";
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
  publicationIntent,
  publicationStoreLocation,
  runFixture,
} from "./local-scenario.js";

test("a completed file closes in Product storage and leaves no Runtime working copy", async () => {
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
        publication: { outputs: [{ name: "clip.video",
          record: "generated:placeholder", publisher: "example.test-product@1" }] },
      },
      publicationStores: publicationStoreLocation(directory),
    });
    assert.equal((await finishClaimedBuild(runtime)).outcome, "complete");
    const result = await new FileBuildResultHistory(join(directory, "results")).read(id);
    assert.equal(result?.outputs["clip.video"]?.representation, "file");
    const resolved = await new FileProductHistory(join(directory, ".hypit", "products"))
      .resolveProduct({ publication: id, name: "clip.video" });
    assert.ok(resolved !== undefined && isBlobRef(resolved.value));
    if (resolved === undefined || !isBlobRef(resolved.value)) throw new Error("expected completed Result file");
    const opened = await resolved.openResource(resolved.value);
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

test("a failed Build keeps published Outputs completed before removing active Runtime state", async () => {
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
        publication: publicationIntent([{
          name: "prompt.text", ref: { id: "prompt" },
        }, { name: "generated.text", ref: { id: "generated" } }, {
          name: "final.document", ref: { id: "document" },
        }], buildFixture),
      },
      publicationStores: publicationStoreLocation(directory),
    });
    assert.equal((await finishClaimedBuild(runtime)).outcome, "failed");
    const result = await new FileBuildResultHistory(join(directory, "results"))
      .read("bld_20260902T120000005Z_0000000001");
    assert.equal(result?.outcome, "failed");
    assert.equal(result?.failure, "generation failed");
    assert.deepEqual(Object.keys(result?.outputs ?? {}), ["prompt.text"]);
    assert.deepEqual(result?.outputs["prompt.text"], {
      address: { publication: "bld_20260902T120000005Z_0000000001", name: "prompt.text" },
      type: result?.outputs["prompt.text"]?.type,
      publisher: "example.test-product@1",
      representation: "inline",
      value: "Greet Ada",
    });
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
      const result = await new FileBuildResultHistory(join(directory, "results")).read(id);
      assert.equal(result?.failure, "first request failed");
      assert.equal(result?.outputs["target.2"]?.representation, "inline");
      assert.equal(result?.outputs["target.2"]?.value, "retained sibling output");
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
    location: import("@hypit/runtime-local").PublicationStoreLocation,
  ) => {
    const base = new FileRunFinalizationStore(
      join(location.root, location.historyPath),
      join(location.root, location.productsPath),
    );
    const finalization: RunFinalizationStore = {
      create: async (seed) => await base.create(seed),
      async openFinalizer(build) {
        const writer = await base.openFinalizer(build);
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
      readStored: async (build) => await base.readStored(build),
    };
    return {
      history: new FileBuildResultHistory(join(location.root, location.historyPath)),
      products: new FileProductHistory(join(location.root, location.productsPath)),
      finalization,
    };
  };
  try {
    const runtime = await createLocalRuntime({
      ...fixture,
      openPublicationStores: openRepository,
      producers: components.producers,
    });
    await runtime.build({
      id: "bld_20260902T120000006Z_0000000001",
      definition: definition(initial),
      authoring: {
        sourcePath: join(directory, "main.svml"),
        targets: ["final.document"],
        publication: { outputs: [{ name: "final.document",
          record: "document:root", publisher: "example.test-product@1" }] },
      },
      publicationStores: publicationStoreLocation(directory),
    });
    const blocked = await runtime.workOnce();
    assert(blocked !== undefined && "decision" in blocked);
    assert.deepEqual(blocked.attention, { step: "publication", error: "result store unavailable" });
    assert.equal(generationCalls, 1);
    assert.equal(await runtime.workOnce(), undefined);

    rejectSync = false;
    const runFinalizer = createLocalRunFinalizer({ ...fixture, openPublicationStores: openRepository });
    const completed = await runFinalizer.finalize(blocked);
    assert(completed !== undefined && "outcome" in completed);
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
  const unavailable: RunFinalizationStore = {
    async create() { throw new Error("publication finalization refused creation"); },
    async openFinalizer() { return undefined; },
    async removeIncomplete() {},
    async readStored() { return undefined; },
  };
  const history = {
    async read() { return undefined; },
    async browse() { return { results: [] }; },
    async openExecutionLog() { return undefined; },
  };
  const products = {
    async readProduct() { return undefined; },
    async resolveProduct() { return undefined; },
  };
  try {
    const runtime = await createLocalRuntime({
      ...fixture,
      openPublicationStores: async () => ({
        history,
        products,
        finalization: unavailable,
      }),
    });
    await assert.rejects(runtime.build({
      id: "bld_20260902T120000007Z_0000000001",
      definition: definition(initial),
      authoring: {
        sourcePath: join(directory, "main.svml"),
        targets: ["final.document"],
        publication: { outputs: [{ name: "final.document",
          record: "document:root", publisher: "example.test-product@1" }] },
      },
      publicationStores: publicationStoreLocation(directory),
    }), /publication finalization refused creation/u);
    const status = await runtime.inspect("bld_20260902T120000007Z_0000000001");
    assert.equal(status, undefined);
    assert.equal(await runtime.workOnce(), undefined);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
