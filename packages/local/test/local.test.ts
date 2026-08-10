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

import { FileArtifactStore, createFileArtifactStorePackage } from "@narratage/artifact-store-fs";
import { createEnvironmentCredentialStorePackage } from "@narratage/credential-store-env";
import { MemoryArtifactStore } from "@narratage/driver-node";
import { defineEndpointPackage } from "@narratage/endpoint-kit";
import type { RecoverableEndpoint } from "@narratage/endpoint-kit";
import type {
  ComponentPackage,
  EndpointPackage,
} from "@narratage/local";
import { createLocalExecutionPackage, createProjectLocalRuntime } from "@narratage/local";
import { digestOf } from "@narratage/core";
import {
  createNodePackageLock,
  writeNodePackageLock,
} from "@narratage/package-loader-node";
import { LocalBuildScheduler, credentialRef, defineRuntimeServicePackage } from "@narratage/runtime";
import type { CredentialValue, WritableCredentialStore } from "@narratage/runtime";
import type { RuntimeModuleManifest } from "@narratage/runtime";
import { createSqliteRuntimeServicePackage } from "@narratage/store-sqlite";

import {
  capabilities,
  createGreetingBuild,
  implementationDigests,
  manifest as greetingManifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

const providerModule = { name: "example.local-endpoint", version: "1" } as const;
const providerFacet = { module: providerModule, name: "generation" } as const;
const providerDigest = digestOf("example.local-endpoint/generation@1");
const providerManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@1",
  name: providerModule.name,
  version: providerModule.version,
  facets: [{
    name: providerFacet.name,
    role: "capability-endpoint",
    implementation: { locator: "example.local-endpoint/generation", digest: providerDigest },
    permissions: [],
    fulfills: [{ capability: capabilities.generation, returns: types.generated }],
    lifecycle: "recoverable",
    defaultConcurrency: 1,
  }],
};

function projectRuntimeFixture(directory: string) {
  const execution = createLocalExecutionPackage("execution.local");
  const state = createSqliteRuntimeServicePackage({
    path: join(directory, ".svml", "runtime.sqlite"),
    name: "state.sqlite",
    buildInstance: "state.builds",
    operationInstance: "state.operations",
    dispatchInstance: "state.dispatch",
    journalInstance: "state.journal",
  });
  const artifacts = createFileArtifactStorePackage({
    root: join(directory, ".svml", "artifacts"),
    instance: "artifacts.fs",
  });
  const credentials = createEnvironmentCredentialStorePackage({ instance: "credentials.env" });
  return {
    runtimeServices: [execution, state, artifacts, credentials],
    runtimeSelection: {
      scheduler: "execution.local.scheduler",
      worker: "execution.local.worker",
      stores: {
        build: "state.builds",
        operations: "state.operations",
        dispatch: "state.dispatch",
        journal: "state.journal",
        artifacts: "artifacts.fs",
        credentials: ["credentials.env"],
      },
    },
    allowedPermissions: ["filesystem:state", "filesystem:artifacts", "environment:credentials"],
    scheduling: { maxConcurrency: 4 },
  } as const;
}

test("Artifact GC is explicit, dry-run by default, and only removes unreachable managed bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-artifact-gc-"));
  try {
    const artifacts = new FileArtifactStore(join(directory, ".svml", "artifacts"));
    const orphan = await artifacts.put(new TextEncoder().encode("orphan"), "application/octet-stream");
    const runtime = await createProjectLocalRuntime({ root: directory, ...projectRuntimeFixture(directory) });
    const preview = await runtime.garbageCollectArtifacts();
    assert.deepEqual(preview.unreachable, [orphan.digest]);
    assert.deepEqual(preview.deleted, []);
    assert.equal(await artifacts.has(orphan.digest), true);
    const applied = await runtime.garbageCollectArtifacts({ apply: true });
    assert.deepEqual(applied.deleted, [orphan.digest]);
    assert.equal(await artifacts.has(orphan.digest), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Endpoint-declared credentials use the selected writable Store without a Provider switch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-auth-"));
  const values = new Map<string, CredentialValue>();
  const credentialStore: WritableCredentialStore = {
    owns(ref) { return ref.store === "memory"; },
    async resolve(ref) { return ref.store === "memory" ? values.get(ref.key) : undefined; },
    async put(ref, value) { values.set(ref.key, value); },
    async delete(ref) { return values.delete(ref.key); },
  };
  const memoryCredentials = defineRuntimeServicePackage({
    name: "credentials.memory",
    module: { name: "example.credentials-memory", version: "1" },
    services: [{
      role: "credential-store",
      facet: "credential-store",
      instance: "credentials.memory",
      implementation: { locator: "example.credentials-memory", digest: digestOf("credentials-memory@1") },
      service: credentialStore,
    }],
  });
  const endpoint = defineEndpointPackage({
    module: providerModule,
    facet: "generation",
    instance: "generation.auth-test",
    implementation: { locator: "example.local-endpoint/generation", digest: providerDigest },
    credentials: { apiKey: credentialRef("memory", "generation.api-key") },
    credentialInputs: { apiKey: { label: "Generation API key" } },
    capabilities: [{
      capability: capabilities.generation,
      returns: types.generated,
      lifecycle: "recoverable",
      endpoint: {
        start() { throw new Error("unused"); },
        resume() { throw new Error("unused"); },
      },
    }],
  });
  try {
    const base = projectRuntimeFixture(directory);
    const runtime = await createProjectLocalRuntime({
      root: directory,
      ...base,
      runtimeServices: [...base.runtimeServices.slice(0, -1), memoryCredentials],
      runtimeSelection: {
        ...base.runtimeSelection,
        stores: { ...base.runtimeSelection.stores, credentials: ["credentials.memory"] },
      },
      allowedPermissions: ["filesystem:state", "filesystem:artifacts"],
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

test("project local runtime resumes durable work while component and endpoint packages stay replaceable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-"));
  const initial = createGreetingBuild();
  const catalog = {
    format: "svml.build-catalog-descriptor@1" as const,
    core: initial.id,
    source: { path: join(directory, "main.svml"), closure: digestOf("source:greeting") },
    aliases: [{
      name: "final.document",
      type: initial.plan.goals[0]!.type,
      ref: { kind: "logical-output" as const, id: initial.request.targets[0]!.output },
    }],
  };
  let promptCalls = 0;
  let requestCalls = 0;
  let assembleCalls = 0;
  let starts = 0;
  let resumes = 0;
  let cancels = 0;
  const components: ComponentPackage = {
    name: "example.components",
    producers: [
      {
        producer: producers.makePrompt,
        implementationDigest: implementationDigests.makePrompt,
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
        implementationDigest: implementationDigests.requestText,
        handler: ({ inputs }) => {
        requestCalls += 1;
        assert.equal(inputs.prompt?.value.kind, "inline");
        return { outputs: {}, needs: { generation: { prompt: inputs.prompt.value.value } } };
        },
      },
      {
        producer: producers.assemble,
        implementationDigest: implementationDigests.assemble,
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
  const recoverableEndpoint: RecoverableEndpoint = {
    start({ operation }) {
      starts += 1;
      return { status: "pending", checkpoint: { remoteJob: operation.submissionKey }, wakeAt: Date.now() };
    },
    resume({ checkpoint }) {
      resumes += 1;
      assert.ok(checkpoint);
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Hello from durable local Runtime" },
          conformance: "exact",
          delivery: "executed",
          metadata: { checkpoint },
        },
      };
    },
    cancel() {
      cancels += 1;
      return { status: "confirmed" };
    },
  };
  const endpointPackage: EndpointPackage = {
    name: "example.endpoint.personal",
    manifest: providerManifest,
    instance: { id: "generation.personal", facet: providerFacet },
    bindings: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "generation.personal",
    }],
    credentials: [],
    install(registry) {
      registry.registerRecoverableEndpoint(
        "generation.personal",
        capabilities.generation,
        types.generated,
        recoverableEndpoint,
        {
          runtimeImplementation: {
            facet: providerFacet,
            digest: providerDigest,
            configurationDigest: digestOf({}),
          },
        },
      );
    },
  };

  try {
    const firstRuntime = await createProjectLocalRuntime({
      root: directory,
      ...projectRuntimeFixture(directory),
      components: [components],
      endpoints: [endpointPackage],
    });
    const first = await firstRuntime.build({ id: "greeting-build", state: initial, catalog });
    assert.equal(first.status, "queued");
    assert.equal((await firstRuntime.workOnce({ owner: "worker-one", leaseMs: 5_000 }))?.phase, "waiting");
    assert.equal(starts, 1);
    assert.equal(resumes, 0);
    await firstRuntime.close();

    const secondRuntime = await createProjectLocalRuntime({
      root: directory,
      ...projectRuntimeFixture(directory),
      components: [components],
      endpoints: [endpointPackage],
    });
    const second = await secondRuntime.build({ id: "greeting-build", state: createGreetingBuild(), catalog });
    assert.equal(second.status, "waiting");
    assert.equal((await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 }))?.terminal, "complete");
    assert.equal(starts, 1);
    assert.equal(resumes, 1);
    assert.equal(promptCalls, 1, "persisted Core facts stop deterministic upstream replay");
    assert.equal(requestCalls, 1, "the Need request Producer is also persisted");
    assert.equal(assembleCalls, 1);
    const clientStatus = await secondRuntime.status("greeting-build");
    assert.equal(clientStatus.catalog?.core, initial.id);
    assert.equal(clientStatus.catalog?.aliases[0]?.name, "final.document");
    assert.deepEqual((await secondRuntime.builds()).map((item) => item.build), ["greeting-build"]);

    await secondRuntime.build({ id: "greeting-follow", state: createGreetingBuild() });
    await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    const followed = await secondRuntime.build(
      { id: "greeting-follow", state: createGreetingBuild() },
      { follow: true, pollIntervalMs: 1, maxWaitMs: 1_000 },
    );
    assert.equal(followed.status, "complete");
    assert.equal(starts, 2);
    assert.equal(resumes, 2);
    const followedStatus = await secondRuntime.status("greeting-follow");
    assert.equal(followedStatus.build?.state.status, "complete");
    assert.equal(followedStatus.operations.length, 1);

    const waiting = await secondRuntime.build({ id: "greeting-cancel", state: createGreetingBuild() });
    assert.equal(waiting.status, "queued");
    await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    const requested = await secondRuntime.cancel("greeting-cancel");
    assert.equal(requested?.admission, "closing");
    const cancelled = await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    assert.equal(cancelled?.terminal, "cancelled");
    assert.equal(cancels, 1);
    await secondRuntime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime activates locked compute facets without deployment source registration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-locked-components-"));
  const runtimeRoot = join(directory, "external-project");
  const installedRoot = join(directory, "narratage-install");
  const packageRoot = join(installedRoot, "node_modules", "example-greeting-components");
  const lockPath = join(directory, "svml.packages.lock");
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-greeting-components",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    svml: { activation: "./activation.mjs" },
  }), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    const manifest = ${JSON.stringify(greetingManifest)};
    const module = { name: manifest.name, version: manifest.version };
    const producer = (name) => ({ module, name });
    export default {
      format: "svml.node-package@1",
      name: "example-greeting-components",
      modules: [{ manifest }],
      components: [{
        name: "example-greeting-components/compute",
        producers: [
          {
            producer: producer("make-prompt"),
            implementationDigest: ${JSON.stringify(implementationDigests.makePrompt)},
            handler({ inputs }) {
              const intent = inputs.intent.value.value;
              return { outputs: { prompt: { kind: "inline", value: "Greet " + intent.name } }, needs: {} };
            },
          },
          {
            producer: producer("placeholder-text"),
            implementationDigest: ${JSON.stringify(implementationDigests.placeholderText)},
            handler() {
              return { outputs: { generated: { kind: "inline", value: "Preview greeting" } }, needs: {} };
            },
          },
          {
            producer: producer("assemble"),
            implementationDigest: ${JSON.stringify(implementationDigests.assemble)},
            handler({ inputs }) {
              return { outputs: { document: { kind: "inline", value: { text: inputs.generated.value.value } } }, needs: {} };
            },
          },
        ],
      }],
    };
  `, "utf8");

  try {
    const lock = await createNodePackageLock(["example-greeting-components"], installedRoot);
    await writeNodePackageLock(lockPath, lock);
    const runtime = await createProjectLocalRuntime({
      root: runtimeRoot,
      ...projectRuntimeFixture(runtimeRoot),
      packageRoot: installedRoot,
      packageLock: "../svml.packages.lock",
    });
    await runtime.build({
      id: "unlocked-preview",
      state: createGreetingBuild({ generationRealization: "placeholder", goalAccepts: "substitute" }),
    });
    const refused = await runtime.workOnce({ owner: "locked-test", leaseMs: 5_000 });
    assert.equal(refused?.terminal, "failed");
    assert.match(refused?.reason ?? "", /does not bind this Host's implementation package closure/u);
    const result = await runtime.build({
      id: "locked-preview",
      state: createGreetingBuild({
        generationRealization: "placeholder",
        goalAccepts: "substitute",
        implementationClosure: lock.digest,
      }),
    });
    assert.equal(result.status, "queued");
    const completed = await runtime.workOnce({ owner: "locked-test", leaseMs: 5_000 });
    assert.equal(completed?.terminal, "complete");
    assert.equal((await runtime.status("locked-preview")).build?.state.records
      .some((record) => record.id === "document:root"), true);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime uses only the explicitly selected Scheduler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-scheduler-service-"));
  let creates = 0;
  const scheduler = defineRuntimeServicePackage({
    module: { name: "example.scheduler", version: "1" },
    services: [{
      role: "scheduler",
      facet: "scheduler",
      instance: "scheduler.example",
      implementation: {
        locator: "example.scheduler/fair",
        digest: digestOf("example.scheduler/fair@1"),
      },
      service: {
        create(executor, options) {
          creates += 1;
          return new LocalBuildScheduler(executor, options);
        },
      },
    }],
  });
  try {
    const base = projectRuntimeFixture(directory);
    const runtime = await createProjectLocalRuntime({
      root: directory,
      ...base,
      runtimeServices: [...base.runtimeServices, scheduler],
      runtimeSelection: { ...base.runtimeSelection, scheduler: "scheduler.example" },
    });
    await runtime.build({ id: "scheduler-selection", state: createGreetingBuild() });
    await runtime.workOnce({ owner: "scheduler-test", leaseMs: 5_000 });
    assert.equal(creates, 1);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("two installed Schedulers are unambiguous because the Profile selects one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-scheduler-selection-"));
  const creates = { one: 0, two: 0 };
  const closes = { one: 0, two: 0 };
  const scheduler = (name: "one" | "two") => defineRuntimeServicePackage({
    name: `example.scheduler.${name}`,
    module: { name: `example.scheduler.${name}`, version: "1" },
    services: [{
      role: "scheduler",
      facet: "scheduler",
      instance: `scheduler.${name}`,
      implementation: {
        locator: `example.scheduler.${name}/fair`,
        digest: digestOf(`example.scheduler.${name}/fair@1`),
      },
      service: {
        create(executor, options) {
          creates[name] += 1;
          return new LocalBuildScheduler(executor, options);
        },
      },
    }],
    close() { closes[name] += 1; },
  });
  try {
    const base = projectRuntimeFixture(directory);
    const runtime = await createProjectLocalRuntime({
      root: directory,
      ...base,
      runtimeServices: [...base.runtimeServices, scheduler("one"), scheduler("two")],
      runtimeSelection: { ...base.runtimeSelection, scheduler: "scheduler.two" },
    });
    await runtime.build({ id: "scheduler-two", state: createGreetingBuild() });
    await runtime.workOnce({ owner: "scheduler-test", leaseMs: 5_000 });
    assert.deepEqual(creates, { one: 0, two: 1 });
    await runtime.close();
    assert.deepEqual(closes, { one: 1, two: 1 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime accepts a permission-checked replacement ArtifactStore package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-artifacts-"));
  const module = { name: "example.remote-artifacts", version: "1" } as const;
  const artifactStore = new MemoryArtifactStore();
  const artifacts = defineRuntimeServicePackage({
    name: "example.remote-artifacts",
    module,
    services: [{
        facet: "artifact-store",
        instance: "artifacts.remote",
        role: "artifact-store",
        implementation: {
          locator: "example.remote-artifacts",
          digest: digestOf("example.remote-artifacts@1"),
        },
        permissions: ["network:remote-artifacts"],
        configuration: { bucket: "fixture" },
        service: artifactStore,
    }],
  });
  try {
    const denied = projectRuntimeFixture(directory);
    await assert.rejects(
      createProjectLocalRuntime({
        root: directory,
        ...denied,
        runtimeServices: [...denied.runtimeServices, artifacts],
        runtimeSelection: {
          ...denied.runtimeSelection,
          stores: { ...denied.runtimeSelection.stores, artifacts: "artifacts.remote" },
        },
      }),
      /disallowed Runtime permission network:remote-artifacts/u,
    );
    const allowed = projectRuntimeFixture(directory);
    const runtime = await createProjectLocalRuntime({
      root: directory,
      ...allowed,
      runtimeServices: [...allowed.runtimeServices, artifacts],
      runtimeSelection: {
        ...allowed.runtimeSelection,
        stores: { ...allowed.runtimeSelection.stores, artifacts: "artifacts.remote" },
      },
      allowedPermissions: [...allowed.allowedPermissions, "network:remote-artifacts"],
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
      state: createGreetingBuild(),
      attachments: [{ artifact: sourceArtifact, bytes }],
    });
    const blocked = await runtime.workOnce({ owner: "artifact-test", leaseMs: 5_000 });
    assert.equal(blocked?.terminal, "failed");
    assert.match(blocked?.reason ?? "", /does not bind demanded capability/u);
    assert.deepEqual(await artifactStore.get(sourceArtifact.digest), bytes);
    await assert.rejects(
      runtime.build({
        id: "tampered-source-artifact",
        state: createGreetingBuild(),
        attachments: [{ artifact: sourceArtifact, bytes: new Uint8Array([0]) }],
      }),
      /does not match its staged bytes/u,
    );
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
