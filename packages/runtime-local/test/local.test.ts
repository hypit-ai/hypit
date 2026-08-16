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

import { FileArtifactStore } from "@narratage/artifact-store-fs";
import { EnvironmentCredentialStore } from "@narratage/credential-store-env";
import { MemoryArtifactStore } from "@narratage/driver-node";
import { defineEndpointPackage } from "@narratage/endpoint-kit";
import type { AsyncEndpoint } from "@narratage/endpoint-kit";
import type {
  ComponentPackage,
  EndpointPackage,
} from "@narratage/runtime-local";
import { createLocalRuntime } from "@narratage/runtime-local";
import { buildDefinition } from "@narratage/core";
import {
  collectNodePackageComponents,
  loadNodePackageSelection,
} from "@narratage/package-loader-node";
import { credentialRef } from "@narratage/runtime";
import type { CredentialValue, WritableCredentialStore } from "@narratage/runtime";
import { SqliteRuntimeState } from "@narratage/store-sqlite";

import {
  capabilities,
  createGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

const providerModule = { name: "example.local-endpoint", version: "1" } as const;

function projectRuntimeFixture(directory: string) {
  const state = new SqliteRuntimeState(join(directory, ".narratage", "runtime.sqlite"));
  return {
    buildStore: state.builds,
    buildCatalog: state.catalog,
    operationStore: state.operations,
    dispatchStore: state.dispatch,
    artifactStore: new FileArtifactStore(join(directory, ".narratage", "artifacts")),
    credentialStore: new EnvironmentCredentialStore(),
    scheduling: { maxConcurrency: 4 },
    close: () => state.close(),
  } as const;
}

test("Artifact GC is explicit, dry-run by default, and only removes unreachable managed bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-artifact-gc-"));
  try {
    const artifacts = new FileArtifactStore(join(directory, ".narratage", "artifacts"));
    const orphan = await artifacts.put(new TextEncoder().encode("orphan"), "application/octet-stream");
    const runtime = await createLocalRuntime(projectRuntimeFixture(directory));
    const preview = await runtime.garbageCollectArtifacts();
    assert.deepEqual(preview.unreachable, [orphan.digest]);
    assert.deepEqual(preview.deleted, []);
    assert.equal(await artifacts.has(orphan.digest), true);
    await runtime.build({ id: "active-build", definition: buildDefinition(createGreetingBuild()) });
    await assert.rejects(
      async () => await runtime.garbageCollectArtifacts({ apply: true }),
      /Artifact GC cannot delete while 1 Build is active/u,
    );
    await runtime.cancel("active-build");
    const applied = await runtime.garbageCollectArtifacts({ apply: true });
    assert.deepEqual(applied.deleted, [orphan.digest]);
    assert.equal(await artifacts.has(orphan.digest), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Endpoint-declared credentials use the selected writable Store without a Provider switch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-auth-"));
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
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-"));
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
    const first = await firstRuntime.build({ id: "greeting-build", definition: buildDefinition(initial), catalog });
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

    await firstRuntime.build({ id: "greeting-follow", definition: buildDefinition(createGreetingBuild()) });
    await firstRuntime.workOnce();
    await firstRuntime.workOnce();
    const followed = await firstRuntime.status("greeting-follow");
    assert.equal(followed.dispatch?.terminal, "complete");
    assert.equal(starts, 2);
    assert.equal(polls, 2);
    const followedStatus = await firstRuntime.status("greeting-follow");
    assert.equal(followedStatus.build?.state.status, "complete");
    assert.equal(followedStatus.operations.length, 1);

    const waiting = await firstRuntime.build({ id: "greeting-cancel", definition: buildDefinition(createGreetingBuild()) });
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

test("one local Worker advances independent Builds concurrently under one command limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-parallel-builds-"));
  let active = 0;
  let mostActive = 0;
  const components: ComponentPackage = {
    producers: [
      {
        producer: producers.makePrompt,
        handler: ({ inputs }) => {
          if (inputs.intent?.value.kind !== "inline") throw new Error("missing greeting intent");
          const intent = inputs.intent.value.value as { readonly name: string };
          return {
            outputs: { prompt: { kind: "inline", value: `Greet ${intent.name}` } },
            needs: {},
          };
        },
      },
      {
        producer: producers.placeholderText,
        handler: async ({ inputs }) => {
          if (inputs.prompt?.value.kind !== "inline") throw new Error("missing greeting prompt");
          active += 1;
          mostActive = Math.max(mostActive, active);
          await new Promise((resolve) => setTimeout(resolve, 80));
          active -= 1;
          return {
            outputs: { generated: { kind: "inline", value: `Preview: ${inputs.prompt.value.value}` } },
            needs: {},
          };
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
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      components: [components],
      implementationPackages: ["@example/parallel-a", "@example/parallel-b"],
    });
    await runtime.buildMany(["parallel-a", "parallel-b"].map((id) => ({
      id,
      definition: buildDefinition(createGreetingBuild({ generationRealization: "placeholder" })),
      implementationPackages: [`@example/${id}`],
    })));
    const controller = new AbortController();
    const work = runtime.work({ idlePollMs: 5, signal: controller.signal });
    while (true) {
      const states = await Promise.all(["parallel-a", "parallel-b"].map(async (id) =>
        (await runtime.status(id)).dispatch?.terminal));
      if (states.every((state) => state === "complete")) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    controller.abort();
    await work;
    assert.equal(mostActive, 2);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime accepts components loaded from an installed package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-components-"));
  const runtimeRoot = join(directory, "external-project");
  const installedRoot = join(directory, "narratage-install");
  const packageRoot = join(installedRoot, "node_modules", "example-greeting-components");
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-greeting-components",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    narratage: { activation: "./activation.mjs" },
  }), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    const manifest = ${JSON.stringify(greetingManifest)};
    const module = { name: manifest.name, version: manifest.version };
    const producer = (name) => ({ module, name });
    export default {
      format: "narratage.node-package@1",
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
    const loaded = await loadNodePackageSelection(["example-greeting-components"], installedRoot);
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(runtimeRoot),
      components: collectNodePackageComponents(loaded.map((item) => item.contribution)),
    });
    const result = await runtime.build({
      id: "selected-preview",
      definition: buildDefinition(createGreetingBuild({
        generationRealization: "placeholder",
      })),
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
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-artifacts-"));
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
      definition: buildDefinition(createGreetingBuild()),
      attachments: [{ artifact: sourceArtifact, open: async () => (async function* () { yield bytes; })() }],
    });
    const failed = await runtime.workOnce();
    assert.equal(failed?.terminal, "failed");
    assert.deepEqual(await artifactStore.get(sourceArtifact.digest), bytes);
    let reopened = false;
    await runtime.build({
      id: "existing-source-artifact",
      definition: buildDefinition(createGreetingBuild()),
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
      definition: buildDefinition(createGreetingBuild()),
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
