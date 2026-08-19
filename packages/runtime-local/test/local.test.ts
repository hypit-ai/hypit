import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileArtifactStore } from "@hypit/artifact-store-fs";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { MemoryArtifactStore } from "@hypit/driver-node";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { AsyncEndpoint, EndpointPackage } from "@hypit/endpoint-kit";
import type { ComponentPackage } from "@hypit/component-kit";
import { createLocalRuntime } from "@hypit/runtime-local";
import { defineBuild } from "@hypit/core";
import {
  collectNodePackageComponents,
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
  return {
    buildStore: state.builds,
    buildCatalog: state.catalog,
    operationStore: state.operations,
    dispatchStore: state.dispatch,
    artifactStore: new FileArtifactStore(join(directory, ".hypit", "artifacts")),
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
    const first = await firstRuntime.build({ id: "greeting-build", definition: definition(initial), catalog });
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
    assert.equal(clientStatus.catalog?.aliases[0]?.name, "final.document");
    assert.deepEqual((await firstRuntime.builds()).map((item) => item.build), ["greeting-build"]);

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
        return collectNodePackageComponents(loaded.map((item) => item.contribution));
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

test("project local runtime accepts an explicitly selected replacement ArtifactStore package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-artifacts-"));
  const artifactStore = new MemoryArtifactStore();
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      artifactStore,
    });
    const bytes = new Uint8Array([7, 8, 9]);
    const sourceArtifact = {
      kind: "blob" as const,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
      size: bytes.byteLength,
      mediaType: "application/octet-stream",
    };
    assert.equal(await artifactStore.has(sourceArtifact.digest), false);
    await runtime.build({
      id: "source-artifact-staging",
      definition: definition(createGreetingBuild()),
      attachments: [{ artifact: sourceArtifact, open: async () => (async function* () { yield bytes; })() }],
    });
    const failed = await runtime.workOnce();
    assert.equal(failed?.terminal, "failed");
    assert.deepEqual(await artifactStore.get(sourceArtifact.digest), bytes);
    let reopened = false;
    await runtime.build({
      id: "existing-source-artifact",
      definition: definition(createGreetingBuild()),
      attachments: [{
        artifact: sourceArtifact,
        open: async () => {
          reopened = true;
          throw new Error("existing content-addressed bytes must not be reopened");
        },
      }],
    });
    assert.equal(reopened, false);
    const absentBytes = new Uint8Array([10, 11, 12]);
    const absentArtifact = {
      kind: "blob" as const,
      digest: `sha256:${createHash("sha256").update(absentBytes).digest("hex")}` as const,
      size: absentBytes.byteLength,
      mediaType: "application/octet-stream",
    };
    await assert.rejects(runtime.build({
      id: "mismatched-source-artifact",
      definition: definition(createGreetingBuild()),
      attachments: [{
        artifact: absentArtifact,
        open: async () => (async function* () { yield new Uint8Array([0]); })(),
      }],
    }), /does not match its staged bytes/u);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
