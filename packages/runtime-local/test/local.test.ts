import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileResourceStore } from "@hypit/resource-store-fs";
import { FileBuildResultRepository, readBuildResult } from "@hypit/build-result";
import type { BuildResultRepository } from "@hypit/build-result";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { AsyncEndpoint, EndpointPackage } from "@hypit/endpoint-kit";
import type { ComponentPackage } from "@hypit/component-kit";
import { createLocalRuntime } from "@hypit/runtime-local";
import { defineBuild } from "@hypit/core";
import {
  collectLoadedNodePackageComponents,
  loadNodePackageSelection,
} from "@hypit/package-loader-node";
import { buildExecutionActivity, credentialRef } from "@hypit/runtime";
import type { BuildCompletion, CredentialValue, WritableCredentialStore } from "@hypit/runtime";
import { SqliteRuntimeState } from "@hypit/store-sqlite";

import {
  capabilities,
  createGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

const providerModule = { name: "example.local-endpoint", version: "1" } as const;

function definition(state: ReturnType<typeof createGreetingBuild>, program = state.program) {
  const authored = new Set(state.program.records.map((record) => record.id));
  return defineBuild({
    program,
    initialRecords: state.records.filter((record) => !authored.has(record.id)),
    plan: state.plan,
    targets: state.targets,
  });
}

function projectRuntimeFixture(directory: string) {
  const state = new SqliteRuntimeState(join(directory, ".hypit", "runtime.sqlite"));
  const work = join(directory, ".hypit", "work");
  return {
    buildStore: state.builds,
    buildCatalog: state.catalog,
    operationStore: state.operations,
    commandExecutionStore: state.commandExecutions,
    executionStore: state.execution,
    removeActiveBuild: async (build: string) => await state.removeActiveBuild(build),
    submissionStore: state.submissions,
    resourceStore: new FileResourceStore(join(directory, ".hypit", "artifacts")),
    resourceStoreForBuild: (build: string) => new FileResourceStore(join(work, build)),
    clearBuildResources: async (build: string) => {
      await rm(join(work, build), { recursive: true, force: true });
    },
    openBuildResultRepository: async (location: import("@hypit/build-result-kit").BuildResultRepositoryLocation) => {
      assert.equal(location.selection.use, "@hypit/build-result-fs");
      const config = location.selection.config as { readonly path?: string } | undefined;
      return { repository: new FileBuildResultRepository(join(location.root, config?.path ?? ".hypit/results")) };
    },
    credentialStore: new EnvironmentCredentialStore(),
    close: () => state.close(),
  } as const;
}

function resultDestination(directory: string) {
  return {
    repository: {
      root: directory,
      selection: { use: "@hypit/build-result-fs", config: { path: "results" } },
    },
  } as const;
}

function durableBuildRequest(
  directory: string,
  id: string,
  initial: ReturnType<typeof createGreetingBuild>,
) {
  return {
    id,
    definition: definition(initial),
    catalog: {
      source: { path: join(directory, "main.svml") },
      publishedOutputs: initial.targets.map((target, index) => ({
        name: `target.${index + 1}`,
        ref: { kind: "logical-output" as const, id: target.output },
      })),
    },
    result: resultDestination(directory),
  } as const;
}

test("a Worker that lost Runtime ownership cannot claim a ready Build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-worker-owner-"));
  const initial = createGreetingBuild();
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      assertEnvironment: () => {
        throw new Error("Runtime Worker no longer owns this Runtime");
      },
    });
    await runtime.build(durableBuildRequest(directory, "bld_20260902T120000000Z_0000000001", initial));

    await assert.rejects(runtime.workOnce(), /no longer owns this Runtime/u);
    const status = await runtime.inspect("bld_20260902T120000000Z_0000000001");
    assert.equal(status?.activity, "ready");
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function finishClaimedBuild(
  runtime: Awaited<ReturnType<typeof createLocalRuntime>>,
): Promise<BuildCompletion> {
  let snapshot;
  for (let index = 0; index < 4; index += 1) {
    snapshot = await runtime.workOnce();
    if (snapshot !== undefined && "outcome" in snapshot) return snapshot;
  }
  throw new Error(`Build did not finish; last activity was ${snapshot === undefined
    ? "none" : "wakeAt" in snapshot ? buildExecutionActivity(snapshot) : "removed"}`);
}

test("Endpoint-declared credentials use the selected writable Store without a Provider switch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-auth-"));
  const values = new Map<string, CredentialValue>();
  const credentialStore: WritableCredentialStore = {
    owns(ref) { return ref.store === "memory"; },
    async resolve(ref) { return ref.store === "memory" ? values.get(ref.key) : undefined; },
    async put(ref, value) { values.set(ref.key, value); },
    async delete(ref) { return values.delete(ref.key); },
  };
  const endpoint = defineEndpointPackage({
    module: providerModule,
    facet: "generation",
    instance: "generation.auth-test",
    pool: "generation.auth-test",
    credentials: { apiKey: credentialRef("memory", "generation.api-key") },
    credentialInputs: { apiKey: { label: "Generation API key" } },
    capabilities: [{
      capability: capabilities.generation,
      returns: types.generated,
      lifecycle: "asynchronous",
      endpoint: {
        start() { throw new Error("unused"); },
        poll() { throw new Error("unused"); },
      },
    }],
  });
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      credentialStore,
      endpoints: [endpoint],
    });
    assert.deepEqual((await runtime.credentials("generation.auth-test")).map((item) => ({
      slot: item.slot, configured: item.configured, writable: item.writable,
    })), [{ slot: "apiKey", configured: false, writable: true }]);
    const stored = await runtime.putCredential("generation.auth-test", "apiKey", "secret");
    assert.equal(stored.configured, true);
    const removed = await runtime.deleteCredential("generation.auth-test", "apiKey");
    assert.equal(removed.deleted, true);
    assert.equal(removed.credential.configured, false);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local Runtime advances, polls and cancels work with replaceable packages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-"));
  const initial = createGreetingBuild();
  const catalog = {
    source: { path: join(directory, "main.svml") },
    publishedOutputs: [{
      name: "final.document",
      ref: { kind: "logical-output" as const, id: initial.targets[0]!.output },
    }, {
      name: "prompt.text",
      ref: { kind: "logical-output" as const, id: "prompt" },
    }, {
      name: "generated.text",
      ref: { kind: "logical-output" as const, id: "generated" },
    }],
  };
  let promptCalls = 0;
  let requestCalls = 0;
  let assembleCalls = 0;
  let starts = 0;
  let polls = 0;
  let cancels = 0;
  const components: ComponentPackage = {
    producers: [
      {
        producer: producers.makePrompt,
        handler: ({ inputs }) => {
        promptCalls += 1;
        const intent = inputs.intent;
        assert.equal(intent?.value.kind, "inline");
        const name = (intent.value.value as { readonly name: string }).name;
        return { outputs: { prompt: { kind: "inline", value: `Greet ${name}` } }, needs: {} };
        },
      },
      {
        producer: producers.requestText,
        handler: ({ inputs }) => {
        requestCalls += 1;
        assert.equal(inputs.prompt?.value.kind, "inline");
        return { outputs: {}, needs: { generation: { prompt: inputs.prompt.value.value } } };
        },
      },
      {
        producer: producers.placeholderText,
        handler: async ({ inputs }) => {
          assert.equal(inputs.prompt?.value.kind, "inline");
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { outputs: { generated: { kind: "inline", value: `Preview: ${inputs.prompt.value.value}` } }, needs: {} };
        },
      },
      {
        producer: producers.assemble,
        handler: ({ inputs }) => {
        assembleCalls += 1;
        assert.equal(inputs.generated?.value.kind, "inline");
        return {
          outputs: { document: { kind: "inline", value: { text: inputs.generated.value.value } } },
          needs: {},
        };
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
          value: { kind: "inline", value: "Hello from durable local Runtime" },
        },
      };
    },
    cancel() {
      cancels += 1;
      return { status: "confirmed" };
    },
  };
  const endpointPackage: EndpointPackage = defineEndpointPackage({
    module: providerModule,
    facet: "generation",
    instance: "generation.personal",
    pool: "generation.personal",
    capabilities: [{
      lifecycle: "asynchronous",
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: asyncEndpoint,
    }],
  });

  try {
    const firstRuntime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      components: [components],
      endpoints: [endpointPackage],
    });
    const first = await firstRuntime.build({
      id: "bld_20260902T120000001Z_0000000001",
      definition: definition(initial),
      catalog,
      result: resultDestination(directory),
    });
    assert("view" in first);
    assert.equal(first.view.activity, "ready");
    const firstTurn = await firstRuntime.workOnce();
    assert(firstTurn !== undefined && "wakeAt" in firstTurn);
    assert.equal(buildExecutionActivity(firstTurn), "ready");
    assert.equal(starts, 1);
    assert.equal(polls, 0);
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
    const buildResult = await readBuildResult(join(directory, "results", "bld_20260902T120000001Z_0000000001"));
    assert.deepEqual(Object.keys(buildResult?.outputs ?? {}).sort(), [
      "final.document",
      "generated.text",
      "prompt.text",
    ]);
    assert.deepEqual(buildResult?.targets, ["final.document"]);

    await firstRuntime.build(durableBuildRequest(directory, "bld_20260902T120000002Z_0000000001", createGreetingBuild()));
    await firstRuntime.workOnce();
    await finishClaimedBuild(firstRuntime);
    const followed = await firstRuntime.inspect("bld_20260902T120000002Z_0000000001");
    assert.equal(followed, undefined);
    assert.equal(starts, 2);
    assert.equal(polls, 2);
    const followedStatus = await firstRuntime.inspect("bld_20260902T120000002Z_0000000001");
    assert.equal(followedStatus, undefined);

    const waiting = await firstRuntime.build(durableBuildRequest(directory, "bld_20260902T120000003Z_0000000001", createGreetingBuild()));
    assert("view" in waiting);
    assert.equal(waiting.view.activity, "ready");
    await firstRuntime.workOnce();
    const requested = await firstRuntime.cancel("bld_20260902T120000003Z_0000000001");
    assert.equal(requested?.cancellationRequested, true);
    const cancelled = await finishClaimedBuild(firstRuntime);
    assert.equal(cancelled.outcome, "cancelled");
    assert.equal(cancels, 1);
    await firstRuntime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a completed public file moves into its Build Result and leaves no Runtime working copy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-result-file-"));
  const id = "bld_20260902T120000004Z_0000000001";
  const workStore = new FileResourceStore(join(directory, ".hypit", "work", id));
  const initial = createGreetingBuild({ generationRealization: "placeholder", targetOutputs: ["generated"] });
  const buildDefinition = definition(initial);
  const components: ComponentPackage = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => ({ outputs: { prompt: { kind: "inline", value: "make a clip" } }, needs: {} }),
    }, {
      producer: producers.placeholderText,
      handler: async () => ({
        outputs: { generated: await workStore.put(new TextEncoder().encode("video bytes"), "video/mp4") },
        needs: {},
      }),
    }],
  };
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      components: [components],
    });
    await runtime.build({
      id,
      definition: buildDefinition,
      catalog: {
        source: { path: join(directory, "main.svml") },
        publishedOutputs: [{ name: "clip.video", ref: { kind: "logical-output", id: "generated" } }],
      },
      result: resultDestination(directory),
    });
    assert.equal((await finishClaimedBuild(runtime)).outcome, "complete");
    const result = await readBuildResult(join(directory, "results", id));
    assert.equal(result?.outputs["clip.video"]?.value.kind, "build-file");
    assert.equal(await readFile(join(directory, "results", id, "files", "file-0001.mp4"), "utf8"), "video bytes");
    assert.equal(await stat(join(directory, ".hypit", "work", id)).then(() => true, () => false), false);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed Build keeps public Outputs completed before removing active Runtime state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-bld_20260902T120000005Z_0000000001-"));
  const initial = createGreetingBuild();
  const components: ComponentPackage = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => ({ outputs: { prompt: { kind: "inline", value: "Greet Ada" } }, needs: {} }),
    }, {
      producer: producers.requestText,
      handler: ({ inputs }) => {
        assert.equal(inputs.prompt?.value.kind, "inline");
        return { outputs: {}, needs: { generation: { prompt: inputs.prompt.value.value } } };
      },
    }],
  };
  const endpoint = defineEndpointPackage({
    module: providerModule,
    facet: "generation",
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
      components: [components],
      endpoints: [endpoint],
    });
    await runtime.build({
      id: "bld_20260902T120000005Z_0000000001",
      definition: definition(initial),
      catalog: {
        source: { path: join(directory, "main.svml") },
        publishedOutputs: [{ name: "prompt.text", ref: { kind: "logical-output", id: "prompt" } }, {
          name: "generated.text", ref: { kind: "logical-output", id: "generated" },
        }, {
          name: "final.document", ref: { kind: "logical-output", id: "document" },
        }],
      },
      result: resultDestination(directory),
    });
    assert.equal((await finishClaimedBuild(runtime)).outcome, "failed");
    const result = await readBuildResult(join(directory, "results", "bld_20260902T120000005Z_0000000001"));
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

test("an interrupted Result write finishes explicitly without rerunning the Build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-result-retry-"));
  const initial = createGreetingBuild({ generationRealization: "placeholder" });
  let generationCalls = 0;
  let rejectSync = true;
  const components: ComponentPackage = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => ({ outputs: { prompt: { kind: "inline", value: "Greet Ada" } }, needs: {} }),
    }, {
      producer: producers.placeholderText,
      handler: () => {
        generationCalls += 1;
        return { outputs: { generated: { kind: "inline", value: "Hello" } }, needs: {} };
      },
    }, {
      producer: producers.assemble,
      handler: ({ inputs }) => {
        const generated = inputs.generated?.value;
        assert.equal(generated?.kind, "inline");
        return {
          outputs: { document: { kind: "inline", value: { text: generated.value } } },
          needs: {},
        };
      },
    }],
  };
  const fixture = projectRuntimeFixture(directory);
  const openRepository = async (
    location: import("@hypit/build-result-kit").BuildResultRepositoryLocation,
  ) => {
    const path = (location.selection.config as { readonly path?: string } | undefined)?.path ?? ".hypit/results";
    const base = new FileBuildResultRepository(join(location.root, path));
    const repository: BuildResultRepository = {
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
      remove: async (build) => await base.remove(build),
      read: async (build) => await base.read(build),
      updatePresentation: async (build, update) => await base.updatePresentation(build, update),
      browse: async (request) => await base.browse(request),
      describeOutput: async (build, output) => await base.describeOutput(build, output),
      resolve: async (build, output) => await base.resolve(build, output),
      openFile: async (build, file) => await base.openFile(build, file),
    };
    return { repository };
  };
  try {
    const runtime = await createLocalRuntime({
      ...fixture,
      openBuildResultRepository: openRepository,
      components: [components],
    });
    await runtime.build({
      id: "bld_20260902T120000006Z_0000000001",
      definition: definition(initial),
      catalog: {
        source: { path: join(directory, "main.svml") },
        publishedOutputs: [{ name: "final.document", ref: { kind: "logical-output", id: "document" } }],
      },
      result: resultDestination(directory),
    });
    const blocked = await runtime.workOnce();
    assert(blocked !== undefined && "decision" in blocked);
    assert.deepEqual(blocked.attention, { step: "result", error: "result store unavailable" });
    assert.equal(generationCalls, 1);
    assert.equal(await runtime.workOnce(), undefined);

    rejectSync = false;
    const completed = await runtime.finishResult("bld_20260902T120000006Z_0000000001");
    assert(completed !== undefined);
    assert.equal(completed.outcome, "complete");
    assert.equal(generationCalls, 1);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed Result creation leaves no active Build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-submit-rollback-"));
  const initial = createGreetingBuild({ generationRealization: "placeholder" });
  const fixture = projectRuntimeFixture(directory);
  const unavailable: BuildResultRepository = {
    async create() { throw new Error("result repository refused creation"); },
    async openWriter() { return undefined; },
    async remove() {},
    async read() { return undefined; },
    async updatePresentation() { throw new Error("result repository refused update"); },
    async browse() { return { results: [] }; },
    async describeOutput() { return undefined; },
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
      catalog: {
        source: { path: join(directory, "main.svml") },
        publishedOutputs: [{ name: "final.document", ref: { kind: "logical-output", id: "document" } }],
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

test("an immediate Command left in started state fails its Build without invoking the Producer again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-command-receipt-"));
  const initial = createGreetingBuild({ generationRealization: "placeholder" });
  let calls = 0;
  const components: ComponentPackage = {
    producers: [{
      producer: producers.makePrompt,
      handler: () => {
        calls += 1;
        return { outputs: { prompt: { kind: "inline", value: "must not run" } }, needs: {} };
      },
    }],
  };
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      components: [components],
    });
    const submitted = await runtime.build(durableBuildRequest(directory, "bld_20260902T120000008Z_0000000001", initial));
    const command = submitted.state.outstanding[0];
    assert.ok(command);
    const state = new SqliteRuntimeState(join(directory, ".hypit", "runtime.sqlite"));
    await state.commandExecutions.begin("bld_20260902T120000008Z_0000000001", command.id);
    state.close();

    const terminal = await finishClaimedBuild(runtime);
    assert.equal(terminal.outcome, "failed");
    assert.equal(calls, 0);
    const failed = await readBuildResult(join(directory, "results", "bld_20260902T120000008Z_0000000001"));
    assert.equal(failed?.outcome, "failed");
    assert.match(failed?.failure ?? "", /stopped before its result was stored/u);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a selected historical file is staged once before its Build becomes active", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-bld_20260902T120000009Z_0000000001-"));
  const initial = createGreetingBuild();
  const bytes = new Uint8Array([4, 3, 2, 1]);
  const historical = {
    kind: "blob" as const,
    resource: "res_historical_input" as const,
    size: bytes.byteLength,
    mediaType: "image/png",
  };
  const program = {
    ...initial.program,
    records: initial.program.records.filter((record) => record.id !== "intent:root"),
  };
  const intent = initial.records.find((record) => record.id === "intent:root")!;
  const buildDefinition = defineBuild({
    program,
    initialRecords: [{ ...intent, value: historical }],
    plan: initial.plan,
    targets: initial.targets,
  });
  let attachmentOpens = 0;
  let endpointCalls = 0;
  const components: ComponentPackage = {
    producers: [{
      producer: producers.makePrompt,
      handler: ({ inputs }) => ({ outputs: { prompt: inputs.intent!.value }, needs: {} }),
    }, {
      producer: producers.requestText,
      handler: ({ inputs }) => ({ outputs: {}, needs: { generation: { source: inputs.prompt!.value } } }),
    }, {
      producer: producers.assemble,
      handler: ({ inputs }) => ({
        outputs: { document: { kind: "inline", value: { text: inputs.generated!.id } } },
        needs: {},
      }),
    }],
  };
  const endpoint = defineEndpointPackage({
    module: providerModule,
    facet: "generation",
    instance: "generation.bld_20260902T120000009Z_0000000001",
    pool: "generation.bld_20260902T120000009Z_0000000001",
    capabilities: [{
      lifecycle: "immediate",
      capability: capabilities.generation,
      returns: types.generated,
      handler: async ({ need, resources }) => {
        endpointCalls += 1;
        const source = (need.constraints as { readonly source: typeof historical }).source;
        assert.equal(await resources.has(source.resource), true);
        assert.deepEqual(await resources.get(source.resource), bytes);
        return { value: { kind: "inline", value: "generated from history" } };
      },
    }],
  });
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      components: [components],
      endpoints: [endpoint],
    });
    await runtime.build({
      id: "bld_20260902T120000009Z_0000000001",
      definition: buildDefinition,
      catalog: {
        source: { path: join(directory, "main.svml") },
        publishedOutputs: [{ name: "final.document", ref: { kind: "logical-output", id: "document" } }],
      },
      attachments: [{
        artifact: historical,
        async open() {
          attachmentOpens += 1;
          return (async function* () { yield bytes; })();
        },
      }],
      result: resultDestination(directory),
    });
    assert.equal(attachmentOpens, 1);
    const work = new FileResourceStore(join(directory, ".hypit", "work", "bld_20260902T120000009Z_0000000001"));
    assert.equal(await work.has(historical.resource), true);

    const completed = await runtime.workOnce();
    assert(completed !== undefined && "outcome" in completed);
    assert.equal(completed.outcome, "complete");
    assert.equal(endpointCalls, 1);
    assert.equal(attachmentOpens, 1);
    assert.equal(await work.has(historical.resource), false);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one local Worker admits later Builds while preserving shared Endpoint capacity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-bld_20260902T120000011Z_0000000001uilds-"));
  let unrestrictedActive = 0;
  let mostUnrestricted = 0;
  let limitedActive = 0;
  let mostLimited = 0;
  let markFirstStarted: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
  const components: ComponentPackage = {
    producers: [
      {
        producer: producers.makePrompt,
        handler: async ({ inputs }) => {
          if (inputs.intent?.value.kind !== "inline") throw new Error("missing greeting intent");
          const intent = inputs.intent.value.value as { readonly name: string };
          unrestrictedActive += 1;
          mostUnrestricted = Math.max(mostUnrestricted, unrestrictedActive);
          markFirstStarted?.();
          markFirstStarted = undefined;
          await new Promise((resolve) => setTimeout(resolve, 80));
          unrestrictedActive -= 1;
          return {
            outputs: { prompt: { kind: "inline", value: `Greet ${intent.name}` } },
            needs: {},
          };
        },
      },
      {
        producer: producers.requestText,
        handler: ({ inputs }) => {
          if (inputs.prompt?.value.kind !== "inline") throw new Error("missing greeting prompt");
          return { outputs: {}, needs: { generation: { prompt: inputs.prompt.value.value } } };
        },
      },
      {
        producer: producers.assemble,
        handler: ({ inputs }) => {
          if (inputs.generated?.value.kind !== "inline") throw new Error("missing generated greeting");
          return {
            outputs: { document: { kind: "inline", value: { text: inputs.generated.value.value } } },
            needs: {},
          };
        },
      },
    ],
  };
  const endpoint = defineEndpointPackage({
    module: providerModule,
    facet: "generation",
    instance: "generation.serial",
    pool: "generation.serial",
    defaultConcurrency: 1,
    capabilities: [{
      lifecycle: "immediate",
      capability: capabilities.generation,
      returns: types.generated,
      handler: async () => {
        limitedActive += 1;
        mostLimited = Math.max(mostLimited, limitedActive);
        await new Promise((resolve) => setTimeout(resolve, 80));
        limitedActive -= 1;
        return { value: { kind: "inline", value: "Hello" } };
      },
    }],
  });
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      components: [components],
      endpoints: [endpoint],
    });
    await runtime.build(durableBuildRequest(directory, "bld_20260902T120000010Z_0000000001", createGreetingBuild()));
    const controller = new AbortController();
    const work = runtime.work({ idlePollMs: 5, signal: controller.signal });
    await firstStarted;
    await runtime.build(durableBuildRequest(directory, "bld_20260902T120000011Z_0000000001", createGreetingBuild()));
    while (true) {
      const outcomes = await Promise.all(["bld_20260902T120000010Z_0000000001", "bld_20260902T120000011Z_0000000001"].map(async (id) =>
        (await readBuildResult(join(directory, "results", id)))?.outcome));
      if (outcomes.every((outcome) => outcome === "complete")) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    controller.abort();
    await work;
    assert.equal(mostUnrestricted, 2, "a later Build must join work already in progress");
    assert.equal(mostLimited, 1, "declared capacity must span independent Builds");
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime accepts components loaded from an installed package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-components-"));
  const runtimeRoot = join(directory, "external-project");
  const installedRoot = join(directory, "hypit-install");
  const packageRoot = join(installedRoot, "node_modules", "example-greeting-components");
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-greeting-components",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    hypit: { activation: "./activation.mjs" },
  }), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    const manifest = ${JSON.stringify(greetingManifest)};
    const module = { name: manifest.name, version: manifest.version };
    const producer = (name) => ({ module, name });
    export default {
      format: "hypit.node-package@1",
      modules: [{ manifest }],
      components: [{
        producers: [
          {
            producer: producer("make-prompt"),
            handler({ inputs }) {
              const intent = inputs.intent.value.value;
              return { outputs: { prompt: { kind: "inline", value: "Greet " + intent.name } }, needs: {} };
            },
          },
          {
            producer: producer("placeholder-text"),
            handler() {
              return { outputs: { generated: { kind: "inline", value: "Preview greeting" } }, needs: {} };
            },
          },
          {
            producer: producer("assemble"),
            handler({ inputs }) {
              return { outputs: { document: { kind: "inline", value: { text: inputs.generated.value.value } } }, needs: {} };
            },
          },
        ],
      }],
    };
  `, "utf8");

  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(runtimeRoot),
      loadComponentPackages: async (specifiers) => {
        const loaded = await loadNodePackageSelection(specifiers, installedRoot);
        return collectLoadedNodePackageComponents(loaded);
      },
    });
    const selected = createGreetingBuild({ generationRealization: "placeholder" });
    const result = await runtime.build({
      ...durableBuildRequest(runtimeRoot, "bld_20260902T120000012Z_0000000001", selected),
      componentPackages: ["example-greeting-components"],
    });
    assert("view" in result);
    assert.equal(result.view.activity, "ready");
    const completed = await finishClaimedBuild(runtime);
    assert.equal(completed.outcome, "complete");
    assert.equal((await readBuildResult(join(runtimeRoot, "results", "bld_20260902T120000012Z_0000000001")))?.outcome, "complete");
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime remembers the complete package closure across incremental Builds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-component-closure-"));
  const loadedSelections: string[][] = [];
  const sharedComponents: ComponentPackage = {
    validators: [{ type: types.intent, handler() {} }],
    producers: [
      {
        producer: producers.makePrompt,
        handler({ inputs }) {
          const intent = inputs.intent?.value;
          assert.equal(intent?.kind, "inline");
          const name = (intent.value as { readonly name: string }).name;
          return { outputs: { prompt: { kind: "inline", value: `Greet ${name}` } }, needs: {} };
        },
      },
      {
        producer: producers.placeholderText,
        handler() {
          return { outputs: { generated: { kind: "inline", value: "Preview greeting" } }, needs: {} };
        },
      },
      {
        producer: producers.assemble,
        handler({ inputs }) {
          const generated = inputs.generated?.value;
          assert.equal(generated?.kind, "inline");
          return { outputs: { document: { kind: "inline", value: { text: generated.value } } }, needs: {} };
        },
      },
    ],
  };
  const runtime = await createLocalRuntime({
    ...projectRuntimeFixture(directory),
    loadComponentPackages(specifiers) {
      loadedSelections.push([...specifiers]);
      return [
        ...specifiers.map((specifier) => ({ specifier, components: [] })),
        { specifier: "example-shared-components", components: [sharedComponents] },
      ];
    },
  });
  try {
    for (const [id, specifier] of [
      ["bld_20260902T120000013Z_0000000001", "example-feature-a"],
      ["bld_20260902T120000014Z_0000000001", "example-feature-b"],
      ["bld_20260902T120000015Z_0000000001", "example-shared-components"],
    ] as const) {
      const initial = createGreetingBuild({ generationRealization: "placeholder" });
      await runtime.build({
        ...durableBuildRequest(directory, id, initial),
        componentPackages: [specifier],
      });
      const completed = await finishClaimedBuild(runtime);
      assert.equal(completed.outcome, "complete");
    }
    assert.deepEqual(loadedSelections, [
      ["example-feature-a"],
      ["example-feature-b"],
    ]);
  } finally {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});
