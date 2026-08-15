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
} from "@narratage/runtime-local";
import { createLocalExecutionPackage, createProjectLocalRuntime } from "@narratage/runtime-local";
import { digestOf } from "@narratage/core";
import {
  collectNodePackageComponents,
  loadNodePackageSelection,
} from "@narratage/package-loader-node";
import { LocalBuildScheduler, credentialRef, defineRuntimeInfrastructurePackage } from "@narratage/runtime";
import type { CredentialValue, WritableCredentialStore } from "@narratage/runtime";
import type { RuntimeModuleManifest } from "@narratage/runtime";
import { createSqliteRuntimeInfrastructurePackage } from "@narratage/store-sqlite";

import {
  capabilities,
  createGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

const providerModule = { name: "example.local-endpoint", version: "1" } as const;
const providerFacet = { module: providerModule, name: "generation" } as const;
const providerManifest: RuntimeModuleManifest = {
  format: "narratage.runtime-module@1",
  name: providerModule.name,
  version: providerModule.version,
  facets: [{
    name: providerFacet.name,
    role: "capability-endpoint",
    fulfills: [{ capability: capabilities.generation, returns: types.generated }],
    lifecycle: "recoverable",
    defaultConcurrency: 1,
  }],
};

function projectRuntimeFixture(directory: string) {
  const execution = createLocalExecutionPackage("execution");
  const state = createSqliteRuntimeInfrastructurePackage({
    path: join(directory, ".narratage", "runtime.sqlite"),
    instance: "state",
  });
  const artifacts = createFileArtifactStorePackage({
    root: join(directory, ".narratage", "artifacts"),
    instance: "artifacts",
  });
  const credentials = createEnvironmentCredentialStorePackage({ instance: "credentials" });
  return {
    infrastructure: [execution, state, artifacts, credentials],
    roles: {
      scheduler: { from: "execution", part: "scheduler" },
      worker: { from: "execution", part: "worker" },
      buildStore: { from: "state", part: "builds" },
      operationStore: { from: "state", part: "operations" },
      dispatchStore: { from: "state", part: "dispatch" },
      artifactStore: { from: "artifacts", part: "store" },
      credentialStores: [{ from: "credentials", part: "store" }],
    },
    scheduling: { maxConcurrency: 4 },
  } as const;
}

test("Artifact GC is explicit, dry-run by default, and only removes unreachable managed bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-artifact-gc-"));
  try {
    const artifacts = new FileArtifactStore(join(directory, ".narratage", "artifacts"));
    const orphan = await artifacts.put(new TextEncoder().encode("orphan"), "application/octet-stream");
    const runtime = await createProjectLocalRuntime({ dataRoot: directory, ...projectRuntimeFixture(directory) });
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
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-auth-"));
  const values = new Map<string, CredentialValue>();
  const credentialStore: WritableCredentialStore = {
    owns(ref) { return ref.store === "memory"; },
    async resolve(ref) { return ref.store === "memory" ? values.get(ref.key) : undefined; },
    async put(ref, value) { values.set(ref.key, value); },
    async delete(ref) { return values.delete(ref.key); },
  };
  const memoryCredentials = defineRuntimeInfrastructurePackage({
    module: { name: "example.credentials-memory", version: "1" },
    instance: "memory-credentials",
    parts: [{
      role: "credential-store",
      facet: "credential-store",
      part: "store",
      port: credentialStore,
    }],
  });
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
      dataRoot: directory,
      ...base,
      infrastructure: [...base.infrastructure.slice(0, -1), memoryCredentials],
      roles: {
        ...base.roles,
        credentialStores: [{ from: "memory-credentials", part: "store" }],
      },
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
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-"));
  const initial = createGreetingBuild();
  const catalog = {
    format: "narratage.build-catalog-descriptor@1" as const,
    core: initial.id,
    source: { path: join(directory, "main.svml"), closure: digestOf("source:greeting") },
    aliases: [{
      name: "final.document",
      ref: { kind: "logical-output" as const, id: initial.request.targets[0]!.output },
    }],
  };
  let promptCalls = 0;
  let requestCalls = 0;
  let assembleCalls = 0;
  let placeholderCalls = 0;
  let starts = 0;
  let resumes = 0;
  let cancels = 0;
  let cancellationMode: "confirmed" | "unsupported" = "confirmed";
  let holdNextStart = false;
  let startEntered: (() => void) | undefined;
  let releaseStart: (() => void) | undefined;
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
          placeholderCalls += 1;
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
  const recoverableEndpoint: RecoverableEndpoint = {
    start({ operation }) {
      starts += 1;
      const pending = { status: "pending" as const, checkpoint: { remoteJob: operation.id }, wakeAt: Date.now() };
      if (!holdNextStart) return pending;
      holdNextStart = false;
      startEntered?.();
      return new Promise((resolve) => { releaseStart = () => resolve(pending); });
    },
    resume({ checkpoint }) {
      resumes += 1;
      assert.ok(checkpoint);
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Hello from durable local Runtime" },
        },
      };
    },
    cancel() {
      cancels += 1;
      return { status: cancellationMode };
    },
  };
  const endpointPackage: EndpointPackage = {
    manifest: providerManifest,
    instance: {
      id: "generation.personal",
      facet: providerFacet,
      pool: "generation.personal",
    },
    offers: [{
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
      );
    },
  };

  try {
    const firstRuntime = await createProjectLocalRuntime({
      dataRoot: directory,
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
      dataRoot: directory,
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
    const tooLate = await secondRuntime.cancelOperation(followedStatus.operations[0]!.id);
    assert.equal(tooLate?.status, "completed");
    assert.equal(tooLate?.cancellation?.status, "too-late");

    const waiting = await secondRuntime.build({ id: "greeting-cancel", state: createGreetingBuild() });
    assert.equal(waiting.status, "queued");
    await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    const requested = await secondRuntime.cancel("greeting-cancel");
    assert.equal(requested?.admission, "closing");
    const cancelled = await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    assert.equal(cancelled?.terminal, "cancelled");
    assert.equal(cancels, 1);

    await secondRuntime.build({ id: "greeting-operation-cancel", state: createGreetingBuild() });
    assert.equal(
      (await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 }))?.phase,
      "waiting",
    );
    const [operation] = (await secondRuntime.status("greeting-operation-cancel")).operations;
    assert.ok(operation);
    const operationRequest = await secondRuntime.cancelOperation(operation.id, "stop only this realization");
    assert.equal(operationRequest?.cancellation?.status, "requested");
    const stranded = await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    assert.equal(stranded?.phase, "blocked");
    assert.equal(stranded?.admission, "open", "Operation control does not close unrelated Build admission");
    assert.equal(stranded?.terminal, undefined);
    const controlled = await secondRuntime.operation(operation.id);
    assert.equal(controlled?.status, "cancelled");
    assert.equal(controlled?.cancellation?.status, "confirmed");
    assert.notEqual((await secondRuntime.status("greeting-operation-cancel")).build?.state.status, "failed");
    assert.equal(cancels, 2);

    cancellationMode = "unsupported";
    await secondRuntime.build({ id: "greeting-operation-late", state: createGreetingBuild() });
    await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    const [lateOperation] = (await secondRuntime.status("greeting-operation-late")).operations;
    assert.ok(lateOperation);
    await secondRuntime.cancelOperation(lateOperation.id);
    const lateDispatch = await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    assert.equal(lateDispatch?.phase, "blocked");
    const lateFact = await secondRuntime.operation(lateOperation.id);
    assert.equal(lateFact?.status, "completed", "an unsupported remote stop keeps the factual result");
    assert.equal(lateFact?.cancellation?.status, "unsupported");
    assert.ok(lateFact?.completion, "late paid output remains archived in OperationStore");
    const lateBuild = await secondRuntime.status("greeting-operation-late");
    assert.notEqual(lateBuild.build?.state.status, "complete", "late output is not reduced into Core");
    assert.notEqual(lateBuild.build?.state.status, "failed");

    cancellationMode = "confirmed";
    const assembledBeforeSide = assembleCalls;
    holdNextStart = true;
    const entered = new Promise<void>((resolve) => { startEntered = resolve; });
    await secondRuntime.build({
      id: "greeting-operation-side",
      state: createGreetingBuild({ includeSideTarget: true }),
    });
    const firstSideTurn = secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    await entered;
    const sidePending = await secondRuntime.status("greeting-operation-side");
    const [sideOperation] = sidePending.operations;
    assert.ok(sideOperation);
    await secondRuntime.cancelOperation(sideOperation.id);
    releaseStart?.();
    const sideDispatch = await firstSideTurn;
    assert.equal(placeholderCalls, 1);
    // The Scheduler may finish the independent side branch in this same leased turn; cancellation
    // constrains only the exact remote Command and deliberately imposes no ordering on siblings.
    assert.equal(sideDispatch?.phase, "waiting");
    assert.ok(sideDispatch.availableAt <= Date.now(), JSON.stringify(sideDispatch));
    const reconciledSide = await secondRuntime.workOnce({ owner: "worker-two", leaseMs: 5_000 });
    assert.equal(reconciledSide?.phase, "blocked");
    const sideStatus = await secondRuntime.status("greeting-operation-side");
    assert.equal(sideStatus.build?.state.records.some((item) => item.id === "document:side"), true,
      "an unrelated branch keeps advancing after one Operation is suppressed");
    assert.equal(assembleCalls, assembledBeforeSide + 1);
    assert.notEqual(sideStatus.build?.state.status, "failed");
    await secondRuntime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("two durable Workers share one SQLite capacity limit across Runtime instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-shared-capacity-"));
  let promptCalls = 0;
  let entered: (() => void) | undefined;
  let release: (() => void) | undefined;
  const firstEntered = new Promise<void>((resolve) => { entered = resolve; });
  const holdFirst = new Promise<void>((resolve) => { release = resolve; });
  const components: ComponentPackage = {
    producers: [{
      producer: producers.makePrompt,
      handler: async ({ inputs }) => {
        promptCalls += 1;
        if (promptCalls === 1) {
          entered?.();
          await holdFirst;
        }
        assert.equal(inputs.intent?.value.kind, "inline");
        return { outputs: { prompt: { kind: "inline", value: "Greet Ada" } }, needs: {} };
      },
    }, {
      producer: producers.requestText,
      handler: ({ inputs }) => {
        assert.equal(inputs.prompt?.value.kind, "inline");
        return { outputs: {}, needs: { generation: { prompt: inputs.prompt.value.value } } };
      },
    }, {
      producer: producers.placeholderText,
      handler: ({ inputs }) => ({
        outputs: { generated: { kind: "inline", value: `Preview: ${String(inputs.prompt?.value.kind === "inline" ? inputs.prompt.value.value : "")}` } },
        needs: {},
      }),
    }, {
      producer: producers.assemble,
      handler: ({ inputs }) => ({
        outputs: { document: { kind: "inline", value: { text: String(inputs.generated?.value.kind === "inline" ? inputs.generated.value.value : "") } } },
        needs: {},
      }),
    }],
  };
  const options = () => ({
    ...projectRuntimeFixture(directory),
    scheduling: { maxConcurrency: 1 },
    components: [components],
  } as const);
  let first: Awaited<ReturnType<typeof createProjectLocalRuntime>> | undefined;
  let second: Awaited<ReturnType<typeof createProjectLocalRuntime>> | undefined;
  let firstTurn: Promise<unknown> | undefined;
  let secondTurn: Promise<unknown> | undefined;
  try {
    first = await createProjectLocalRuntime({ dataRoot: directory, ...options() });
    second = await createProjectLocalRuntime({ dataRoot: directory, ...options() });
    await first.build({
      id: "capacity-a",
      state: createGreetingBuild({ generationRealization: "placeholder" }),
    });
    await second.build({
      id: "capacity-b",
      state: createGreetingBuild({ generationRealization: "placeholder" }),
    });
    firstTurn = first.workOnce({ owner: "worker-a", leaseMs: 120 });
    await firstEntered;
    secondTurn = second.workOnce({ owner: "worker-b", leaseMs: 120 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(promptCalls, 1,
      "the second Worker cannot enter after the original capacity expiry while its peer keeps heartbeating");
    const tickets = (await first.queue()).capacity;
    assert.equal(tickets.length, 2, "the active command and its blocked peer are both durable tickets");
    assert.equal(tickets.filter((item) => item.active !== undefined).length, 1);
    release?.();
    await Promise.all([firstTurn, secondTurn]);
    assert.equal(promptCalls, 1, "a capacity miss releases its Build instead of waiting inside the Worker");
    await second.workOnce({ owner: "worker-b", leaseMs: 120 });
    assert.equal(promptCalls, 2);
  } finally {
    release?.();
    await Promise.allSettled([firstTurn, secondTurn].filter((item): item is Promise<unknown> => item !== undefined));
    await second?.close();
    await first?.close();
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
    const runtime = await createProjectLocalRuntime({
      dataRoot: runtimeRoot,
      ...projectRuntimeFixture(runtimeRoot),
      packageRoot: installedRoot,
      components: collectNodePackageComponents(loaded.map((item) => item.contribution)),
    });
    const result = await runtime.build({
      id: "selected-preview",
      state: createGreetingBuild({
        generationRealization: "placeholder",
      }),
    });
    assert.equal(result.status, "queued");
    const completed = await runtime.workOnce({ owner: "selected-test", leaseMs: 5_000 });
    assert.equal(completed?.terminal, "complete");
    assert.equal((await runtime.status("selected-preview")).build?.state.records
      .some((record) => record.id === "document:root"), true);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime uses only the explicitly selected Scheduler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-scheduler-service-"));
  let creates = 0;
  const scheduler = defineRuntimeInfrastructurePackage({
    module: { name: "example.scheduler", version: "1" },
    instance: "custom-scheduler",
    parts: [{
      role: "scheduler",
      facet: "scheduler",
      part: "scheduler",
      port: {
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
      dataRoot: directory,
      ...base,
      infrastructure: [...base.infrastructure, scheduler],
      roles: { ...base.roles, scheduler: { from: "custom-scheduler", part: "scheduler" } },
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
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-scheduler-selection-"));
  const creates = { one: 0, two: 0 };
  const closes = { one: 0, two: 0 };
  const scheduler = (name: "one" | "two") => defineRuntimeInfrastructurePackage({
    module: { name: `example.scheduler.${name}`, version: "1" },
    instance: `scheduler-${name}`,
    parts: [{
      role: "scheduler",
      facet: "scheduler",
      part: "scheduler",
      port: {
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
      dataRoot: directory,
      ...base,
      infrastructure: [...base.infrastructure, scheduler("one"), scheduler("two")],
      roles: { ...base.roles, scheduler: { from: "scheduler-two", part: "scheduler" } },
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

test("project local runtime accepts an explicitly selected replacement ArtifactStore package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-local-artifacts-"));
  const module = { name: "example.remote-artifacts", version: "1" } as const;
  const artifactStore = new MemoryArtifactStore();
  const artifacts = defineRuntimeInfrastructurePackage({
    module,
    instance: "remote-artifacts",
    parts: [{
        facet: "artifact-store",
        part: "store",
        role: "artifact-store",
        port: artifactStore,
    }],
  });
  try {
    const selected = projectRuntimeFixture(directory);
    const runtime = await createProjectLocalRuntime({
      dataRoot: directory,
      ...selected,
      infrastructure: [...selected.infrastructure, artifacts],
      roles: {
        ...selected.roles,
        artifactStore: { from: "remote-artifacts", part: "store" },
      },
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
      attachments: [{ artifact: sourceArtifact, open: async () => (async function* () { yield bytes; })() }],
    });
    const blocked = await runtime.workOnce({ owner: "artifact-test", leaseMs: 5_000 });
    assert.equal(blocked?.terminal, "failed");
    assert.match(blocked?.reason ?? "", /does not bind demanded capability/u);
    assert.deepEqual(await artifactStore.get(sourceArtifact.digest), bytes);
    let reopened = false;
    await runtime.build({
      id: "existing-source-artifact",
      state: createGreetingBuild(),
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
      id: "tampered-source-artifact",
      state: createGreetingBuild(),
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
