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

import { FileArtifactStore } from "@hypit/artifact-store-fs";
import { readBuildResult } from "@hypit/build-result";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { AsyncEndpoint, EndpointPackage } from "@hypit/endpoint-kit";
import type { ComponentPackage } from "@hypit/component-kit";
import { createLocalRuntime } from "@hypit/runtime-local";
import { defineBuild, sealBuildRequest } from "@hypit/core";
import {
  collectLoadedNodePackageComponents,
  loadNodePackageSelection,
} from "@hypit/package-loader-node";
import { credentialRef } from "@hypit/runtime";
import type { CredentialValue, WritableCredentialStore } from "@hypit/runtime";
import { SqliteRuntimeState } from "@hypit/store-sqlite";

import {
  capabilities,
  createGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

const providerModule = { name: "example.local-endpoint", version: "1" } as const;

function definition(state: ReturnType<typeof createGreetingBuild>) {
  return defineBuild(state.program, state.graph, state.request);
}

function projectRuntimeFixture(directory: string) {
  const state = new SqliteRuntimeState(join(directory, ".hypit", "runtime.sqlite"));
  const work = join(directory, ".hypit", "work");
  return {
    buildStore: state.builds,
    buildCatalog: state.catalog,
    operationStore: state.operations,
    dispatchStore: state.dispatch,
    artifactStore: new FileArtifactStore(join(directory, ".hypit", "artifacts")),
    artifactStoreForBuild: (build: string) => new FileArtifactStore(join(work, build)),
    clearBuildArtifacts: async (build: string) => {
      await rm(join(work, build), { recursive: true, force: true });
    },
    credentialStore: new EnvironmentCredentialStore(),
    close: () => state.close(),
  } as const;
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

test("project local runtime queues, polls and cancels work with replaceable packages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-"));
  const initial = createGreetingBuild();
  const catalog = {
    source: { path: join(directory, "main.svml") },
    aliases: [{
      name: "final.document",
      ref: { kind: "logical-output" as const, id: initial.request.targets[0]!.output },
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
      id: "greeting-build",
      definition: definition(initial),
      catalog,
      result: { root: join(directory, "results") },
    });
    assert.equal(first.status, "queued");
    assert.equal((await firstRuntime.workOnce())?.phase, "waiting");
    assert.equal(starts, 1);
    assert.equal(polls, 0);
    const second = await firstRuntime.status("greeting-build");
    assert.equal(second.dispatch?.phase, "waiting");
    assert.equal((await firstRuntime.workOnce())?.terminal, "complete");
    assert.equal(starts, 1);
    assert.equal(polls, 1);
    assert.equal(promptCalls, 1, "persisted Core facts stop deterministic upstream replay");
    assert.equal(requestCalls, 1, "the Need request Producer is also persisted");
    assert.equal(assembleCalls, 1);
    const clientStatus = await firstRuntime.status("greeting-build");
    assert.equal(clientStatus.build, undefined);
    assert.equal(clientStatus.catalog, undefined);
    assert.deepEqual(clientStatus.operations, []);
    assert.equal(clientStatus.dispatch?.terminal, "complete");
    assert.deepEqual(await firstRuntime.builds(), []);
    const buildResult = await readBuildResult(join(directory, "results", "greeting-build"));
    assert.deepEqual(Object.keys(buildResult?.outputs ?? {}).sort(), [
      "final.document",
      "generated.text",
      "prompt.text",
    ]);
    assert.deepEqual(buildResult?.targets, ["final.document"]);

    await firstRuntime.build({ id: "greeting-follow", definition: definition(createGreetingBuild()) });
    await firstRuntime.workOnce();
    await firstRuntime.workOnce();
    const followed = await firstRuntime.status("greeting-follow");
    assert.equal(followed.dispatch?.terminal, "complete");
    assert.equal(starts, 2);
    assert.equal(polls, 2);
    const followedStatus = await firstRuntime.status("greeting-follow");
    assert.equal(followedStatus.build?.state.status, "complete");
    assert.equal(followedStatus.operations.length, 1);

    const waiting = await firstRuntime.build({ id: "greeting-cancel", definition: definition(createGreetingBuild()) });
    assert.equal(waiting.status, "queued");
    await firstRuntime.workOnce();
    const requested = await firstRuntime.cancel("greeting-cancel");
    assert.notEqual(requested?.cancellation, undefined);
    const cancelled = await firstRuntime.workOnce();
    assert.equal(cancelled?.terminal, "cancelled");
    assert.equal(cancels, 1);
    await firstRuntime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a completed public file moves into its Build Result and leaves no Runtime working copy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-result-file-"));
  const id = "public-file-result";
  const workStore = new FileArtifactStore(join(directory, ".hypit", "work", id));
  const initial = createGreetingBuild({ generationRealization: "placeholder" });
  const buildDefinition = defineBuild(initial.program, initial.graph, sealBuildRequest({
    targets: [{ output: "generated" }],
  }));
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
        aliases: [{ name: "clip.video", ref: { kind: "logical-output", id: "generated" } }],
      },
      result: { root: join(directory, "results") },
    });
    assert.equal((await runtime.workOnce())?.terminal, "complete");
    const result = await readBuildResult(join(directory, "results", id));
    assert.equal(result?.outputs["clip.video"]?.value.kind, "build-file");
    assert.equal(await readFile(join(directory, "results", id, "files", "clip.video.mp4"), "utf8"), "video bytes");
    assert.equal(await stat(join(directory, ".hypit", "work", id)).then(() => true, () => false), false);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed Build keeps public Outputs completed before the failure and retires execution state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-partial-result-"));
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
      id: "partial-result",
      definition: definition(initial),
      catalog: {
        source: { path: join(directory, "main.svml") },
        aliases: [{ name: "prompt.text", ref: { kind: "logical-output", id: "prompt" } }, {
          name: "generated.text", ref: { kind: "logical-output", id: "generated" },
        }, {
          name: "final.document", ref: { kind: "logical-output", id: "document" },
        }],
      },
      result: { root: join(directory, "results") },
    });
    assert.equal((await runtime.workOnce())?.terminal, "failed");
    const result = await readBuildResult(join(directory, "results", "partial-result"));
    assert.equal(result?.status, "failed");
    assert.equal(result?.failure, "generation failed");
    assert.deepEqual(Object.keys(result?.outputs ?? {}), ["prompt.text"]);
    assert.deepEqual(result?.outputs["prompt.text"]?.value, { kind: "inline", value: "Greet Ada" });
    const status = await runtime.status("partial-result");
    assert.equal(status.build, undefined);
    assert.deepEqual(status.operations, []);
    assert.equal(status.dispatch?.terminal, "failed");
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one local Worker admits later Builds while preserving shared Endpoint capacity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-parallel-builds-"));
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
    await runtime.build({
      id: "parallel-a",
      definition: definition(createGreetingBuild()),
    });
    const controller = new AbortController();
    const work = runtime.work({ idlePollMs: 5, signal: controller.signal });
    await firstStarted;
    await runtime.build({
      id: "parallel-b",
      definition: definition(createGreetingBuild()),
    });
    while (true) {
      const states = await Promise.all(["parallel-a", "parallel-b"].map(async (id) =>
        (await runtime.status(id)).dispatch?.terminal));
      if (states.every((state) => state === "complete")) break;
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
    const result = await runtime.build({
      id: "selected-preview",
      definition: definition(createGreetingBuild({
        generationRealization: "placeholder",
      })),
      componentPackages: ["example-greeting-components"],
    });
    assert.equal(result.status, "queued");
    const completed = await runtime.workOnce();
    assert.equal(completed?.terminal, "complete");
    assert.equal((await runtime.status("selected-preview")).build?.state.records
      .some((record) => record.id === "document:root"), true);
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
      ["component-closure-a", "example-feature-a"],
      ["component-closure-b", "example-feature-b"],
      ["component-closure-shared", "example-shared-components"],
    ] as const) {
      await runtime.build({
        id,
        definition: definition(createGreetingBuild({ generationRealization: "placeholder" })),
        componentPackages: [specifier],
      });
      const completed = await runtime.workOnce();
      assert.equal(completed?.terminal, "complete");
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
