import assert from "node:assert/strict";
import test from "node:test";

import {
  HostRegistry,
  NodeDriver,
  parseBuildState,
  ProviderRegistry,
  serializeBuildState,
} from "@svml/driver-node";
import type {
  ProviderEndpoint,
  RuntimeProviderImplementation,
} from "@svml/driver-node";
import {
  LocalBuildScheduler,
  MemoryBuildStore,
  MemoryOperationStore,
  RuntimeModuleRegistry,
  localSchedulerOptionsFromClosure,
  resolveRuntimeProfile,
  sealRuntimeProfile,
} from "@svml/runtime";
import type {
  OperationStore,
  RuntimeModuleManifest,
} from "@svml/runtime";
import type { Digest } from "@svml/protocol";
import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";

import {
  capabilities,
  createGreetingBuild,
  implementationDigests,
  manifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

function createParallelGreetingBuild() {
  const closure = createResolvedClosure([manifest]);
  const authored = sealRecord({
    id: "intent:root",
    type: types.intent,
    value: { kind: "inline", value: { name: "Ada" } },
    conformance: "exact",
    origin: {
      kind: "authored" as const,
      sourceDigest: digestOf("source:parallel-greeting"),
      frontendClosureDigest: digestOf("frontend:parallel-greeting"),
    },
  });
  const program = link(closure, [sealTypedModule({
    id: "author:parallel-greeting",
    closureDigest: closure.digest,
    records: [authored],
  })]);
  const graph = sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      {
        id: "prompt",
        type: types.prompt,
        primary: "make-prompt",
        candidates: ["make-prompt"],
        semanticInputs: [{ kind: "record", id: "intent:root" }],
      },
      {
        id: "generated-a",
        type: types.generated,
        primary: "generate-a",
        candidates: ["generate-a"],
        semanticInputs: [{ kind: "logical-output", id: "prompt" }],
      },
      {
        id: "generated-b",
        type: types.generated,
        primary: "generate-b",
        candidates: ["generate-b"],
        semanticInputs: [{ kind: "logical-output", id: "prompt" }],
      },
    ],
    candidates: [
      {
        id: "make-prompt",
        output: "prompt",
        root: { kind: "operation", result: { kind: "operation-result", operation: "make-prompt" } },
        fidelity: "exact",
      },
      {
        id: "generate-a",
        output: "generated-a",
        root: { kind: "operation", result: { kind: "operation-result", operation: "generate-a" } },
        fidelity: "exact",
      },
      {
        id: "generate-b",
        output: "generated-b",
        root: { kind: "operation", result: { kind: "operation-result", operation: "generate-b" } },
        fidelity: "exact",
      },
    ],
    operations: [
      {
        id: "make-prompt",
        producer: producers.makePrompt,
        inputs: { intent: { kind: "record", id: "intent:root" } },
        result: { kind: "output", name: "prompt", record: "prompt:root" },
      },
      {
        id: "generate-a",
        producer: producers.requestText,
        inputs: { prompt: { kind: "logical-output", id: "prompt" } },
        result: {
          kind: "need",
          name: "generation",
          id: "need:generation-a",
          record: "generated:a",
          accepts: "exact",
        },
      },
      {
        id: "generate-b",
        producer: producers.requestText,
        inputs: { prompt: { kind: "logical-output", id: "prompt" } },
        result: {
          kind: "need",
          name: "generation",
          id: "need:generation-b",
          record: "generated:b",
          accepts: "exact",
        },
      },
    ],
  });
  return start(program, graph, sealBuildRequest({
    graph: graph.id,
    targets: [
      { output: "generated-a", accepts: "exact" },
      { output: "generated-b", accepts: "exact" },
    ],
    bindings: [],
  }));
}

function configuredExecutor(options: {
  readonly lane: string;
  readonly defaultConcurrency: number;
  readonly observe: (active: number) => void;
  readonly runtimeImplementation?: RuntimeProviderImplementation;
  readonly providerId?: string;
}) {
  const registry = new HostRegistry();
  const providers = new ProviderRegistry();
  registerGreetingProducers(registry);
  let active = 0;
  let calls = 0;
  providers.registerProvider(
    options.providerId ?? "fixture.seedance",
    capabilities.generation,
    types.generated,
    async () => {
      calls += 1;
      active += 1;
      options.observe(active);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return {
        value: { kind: "inline", value: `Generated ${calls}` },
        conformance: "exact",
        delivery: "executed",
        metadata: {},
      };
    },
    {
      scheduling: {
        lane: options.lane,
        maxConcurrency: options.defaultConcurrency,
      },
      ...(options.runtimeImplementation === undefined
        ? {}
        : { runtimeImplementation: options.runtimeImplementation }),
    },
  );
  return { executor: new NodeDriver({ registry, providers }), providers, getCalls: () => calls };
}

function registerGreetingProducers(registry: HostRegistry): void {
  registry.registerProducer(producers.makePrompt, implementationDigests.makePrompt, ({ inputs }) => {
    const intent = inputs.intent;
    assert.equal(intent?.value.kind, "inline");
    const name = (intent.value.value as { readonly name: string }).name;
    return { outputs: { prompt: { kind: "inline", value: `Greet ${name}` } }, needs: {} };
  });
  registry.registerProducer(producers.requestText, implementationDigests.requestText, ({ inputs }) => {
    const prompt = inputs.prompt;
    assert.equal(prompt?.value.kind, "inline");
    return { outputs: {}, needs: { generation: { prompt: prompt.value.value } } };
  });
  registry.registerProducer(producers.assemble, implementationDigests.assemble, ({ inputs }) => {
    const generated = inputs.generated;
    assert.equal(generated?.value.kind, "inline");
    return {
      outputs: { document: { kind: "inline", value: { text: generated.value.value } } },
      needs: {},
    };
  });
}

const runtimeModule = { name: "example.scheduler-runtime", version: "1" } as const;
const providerFacet = { module: runtimeModule, name: "generation-endpoint" } as const;
const providerImplementationDigest = digestOf("example.scheduler-runtime/generation-endpoint@1");

function resolvedRuntime(laneLimit: number) {
  const manifest: RuntimeModuleManifest = {
    format: "svml.runtime-module@1",
    name: runtimeModule.name,
    version: runtimeModule.version,
    facets: [
      {
        name: "scheduler",
        role: "scheduler",
        implementation: {
          locator: "example.scheduler-runtime/scheduler",
          digest: digestOf("example.scheduler-runtime/scheduler@1"),
        },
        permissions: [],
      },
      {
        name: "operations",
        role: "operation-store",
        implementation: {
          locator: "example.scheduler-runtime/operations",
          digest: digestOf("example.scheduler-runtime/operations@1"),
        },
        permissions: [],
      },
      {
        name: providerFacet.name,
        role: "provider-endpoint",
        implementation: {
          locator: "example.scheduler-runtime/generation-endpoint",
          digest: providerImplementationDigest,
        },
        permissions: [],
        fulfills: [{ capability: capabilities.generation, returns: types.generated }],
        lifecycle: "recoverable",
        defaultConcurrency: 1,
      },
    ],
  };
  const modules = new RuntimeModuleRegistry();
  modules.register(manifest);
  const closure = resolveRuntimeProfile(modules, sealRuntimeProfile({
    name: "scheduler-test",
    instances: [
      { id: "scheduler.local", facet: { module: runtimeModule, name: "scheduler" } },
      { id: "operations.memory", facet: { module: runtimeModule, name: "operations" } },
      { id: "generation.local", facet: providerFacet, lane: "provider:generation.local" },
    ],
    scheduler: "scheduler.local",
    stores: { operations: "operations.memory" },
    providers: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "generation.local",
    }],
    scheduling: {
      maxConcurrency: 8,
      lanes: [{ name: "provider:generation.local", maxConcurrency: laneLimit }],
    },
  }));
  return { closure, modules };
}

function recoverableExecutor(
  endpoint: ProviderEndpoint,
  operations: OperationStore,
  runtime = resolvedRuntime(1),
) {
  const registry = new HostRegistry();
  registerGreetingProducers(registry);
  const providers = new ProviderRegistry();
  providers.registerProviderEndpoint(
    "generation.local",
    capabilities.generation,
    types.generated,
    endpoint,
    {
      runtimeImplementation: {
        facet: providerFacet,
        digest: providerImplementationDigest,
      },
    },
  );
  providers.applyRuntimeClosure(runtime.closure, runtime.modules);
  return {
    executor: new NodeDriver({ registry, providers, operations }),
    runtime,
  };
}

test("one local Scheduler shares a Provider lane across multiple Builds", async () => {
  let maximumActive = 0;
  const { executor, getCalls } = configuredExecutor({
    lane: "seedance:fixture.account",
    defaultConcurrency: 1,
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  const scheduler = new LocalBuildScheduler(executor, { maxConcurrency: 8 });
  const results = await scheduler.run([
    { id: "video-a", state: createGreetingBuild() },
    { id: "video-b", state: createGreetingBuild() },
  ]);

  assert.deepEqual(results.map((result) => result.status), ["complete", "complete"]);
  assert.equal(getCalls(), 2);
  assert.equal(maximumActive, 1);
  assert.equal(results.every((result) =>
    result.journal.some((entry) => entry.lane === "seedance:fixture.account")), true);
});

test("a Runtime Profile lane override changes parallelism without changing either Build", async () => {
  let maximumActive = 0;
  const lane = "seedance:fixture.account";
  const { executor } = configuredExecutor({
    lane,
    defaultConcurrency: 1,
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  const initial = createGreetingBuild();
  const scheduler = new LocalBuildScheduler(executor, {
    maxConcurrency: 8,
    laneLimits: { [lane]: 2 },
  });
  const results = await scheduler.run([
    { id: "video-a", state: initial },
    { id: "video-b", state: initial },
  ]);

  assert.deepEqual(results.map((result) => result.status), ["complete", "complete"]);
  assert.equal(maximumActive, 2);
  assert.equal(results[0]?.state.request.digest, results[1]?.state.request.digest);
});

test("independent paid commands inside one Build may fill the same lane without duplicating their shared upstream", async () => {
  let maximumActive = 0;
  const { executor, getCalls } = configuredExecutor({
    lane: "seedance:fixture.account",
    defaultConcurrency: 2,
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  const [result] = await new LocalBuildScheduler(executor, { maxConcurrency: 8 }).run([{
    id: "two-shots",
    state: createParallelGreetingBuild(),
  }]);

  assert.equal(result?.status, "complete");
  assert.equal(getCalls(), 2);
  assert.equal(maximumActive, 2);
  assert.equal(result?.state.derivations.filter((item) => item.producer.name === producers.makePrompt.name).length, 1);
  assert.equal(result?.state.receipts.length, 2);
});

test("a locked Runtime Closure assembles exact Provider code and Scheduler policy without manual bind", async () => {
  let maximumActive = 0;
  const { closure, modules } = resolvedRuntime(2);
  const { executor, providers } = configuredExecutor({
    lane: "ignored-registration-lane",
    defaultConcurrency: 1,
    runtimeImplementation: {
      facet: providerFacet,
      digest: providerImplementationDigest,
    },
    providerId: "generation.local",
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  providers.applyRuntimeClosure(closure, modules);
  const results = await new LocalBuildScheduler(
    executor,
    localSchedulerOptionsFromClosure(closure),
  ).run([
    { id: "video-a", state: createGreetingBuild() },
    { id: "video-b", state: createGreetingBuild() },
  ]);

  assert.deepEqual(results.map((result) => result.status), ["complete", "complete"]);
  assert.equal(maximumActive, 2, "the locked Profile override, not registration order, owns the lane");
  assert.equal(results.every((result) => result.state.receipts[0]?.fulfiller === "generation.local"), true);
});

test("a same-name Provider with different implementation bytes is rejected before execution", () => {
  const { closure, modules } = resolvedRuntime(1);
  const { providers, getCalls } = configuredExecutor({
    lane: "provider:generation.local",
    defaultConcurrency: 1,
    runtimeImplementation: {
      facet: providerFacet,
      digest: digestOf("tampered-provider-implementation"),
    },
    providerId: "generation.local",
    observe() {},
  });
  assert.throws(() => providers.applyRuntimeClosure(closure, modules), /implementation does not match/u);
  assert.equal(getCalls(), 0);
});

test("BuildStore CAS prevents two Scheduler revisions from silently overwriting each other", async () => {
  const store = new MemoryBuildStore();
  const initial = createGreetingBuild();
  const created = await store.create("video", initial);
  assert.equal(created.revision, 0);
  const first = await store.compareAndSwap("video", 0, initial);
  assert.equal(first.status, "stored");
  const stale = await store.compareAndSwap("video", 0, initial);
  assert.equal(stale.status, "conflict");
  if (stale.status === "conflict") assert.equal(stale.current.revision, 1);
  const read = await store.read("video");
  assert.equal(read?.revision, 1);
});

test("a recoverable Endpoint resumes its journaled Operation after restart without submitting twice", async () => {
  const operations = new MemoryOperationStore();
  const runtime = resolvedRuntime(1);
  let starts = 0;
  let resumes = 0;
  let submissionKey: string | undefined;
  const endpoint: ProviderEndpoint = {
    start({ operation }) {
      starts += 1;
      submissionKey = operation.submissionKey;
      return { status: "pending", checkpoint: { remoteJob: "job-1" } };
    },
    resume({ operation, checkpoint }) {
      resumes += 1;
      assert.equal(operation.submissionKey, submissionKey);
      assert.deepEqual(checkpoint, { remoteJob: "job-1" });
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Hello after restart" },
          conformance: "exact",
          delivery: "executed",
          metadata: { remoteJob: "job-1" },
        },
      };
    },
  };

  const firstExecutor = recoverableExecutor(endpoint, operations, runtime).executor;
  const [first] = await new LocalBuildScheduler(
    firstExecutor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{ id: "video", state: createGreetingBuild() }]);
  assert.equal(first?.status, "paused");
  assert.equal(starts, 1);
  assert.equal(resumes, 0);
  assert.equal(first?.state.receipts.length, 0, "pending external work is not a Core event");
  const pending = first?.journal.find((entry) => entry.status === "pending");
  assert.ok(pending?.operation);
  assert.equal((await operations.read(pending.operation))?.status, "pending");

  const restored = parseBuildState(serializeBuildState(first.state));
  const secondExecutor = recoverableExecutor(endpoint, operations, runtime).executor;
  const [second] = await new LocalBuildScheduler(
    secondExecutor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{ id: "video", state: restored }]);

  assert.equal(second?.status, "complete");
  assert.equal(starts, 1, "the already journaled Operation must not call start again");
  assert.equal(resumes, 1);
  assert.equal((await operations.read(pending.operation))?.status, "completed");
  const metadata = second?.state.receipts[0]?.metadata as {
    readonly endpoint: { readonly remoteJob: string };
    readonly runtime: {
      readonly operation: string;
      readonly submissionKey: string;
      readonly closure: string;
      readonly implementation: string;
    };
  };
  assert.equal(metadata.endpoint.remoteJob, "job-1");
  assert.equal(metadata.runtime.operation, pending.operation);
  assert.equal(metadata.runtime.submissionKey, submissionKey);
  assert.equal(metadata.runtime.closure, runtime.closure.digest);
  assert.equal(metadata.runtime.implementation, providerImplementationDigest);
});

test("a crash after Operation intent but before checkpoint resumes with the same submission key", async () => {
  const operations = new MemoryOperationStore();
  const runtime = resolvedRuntime(1);
  let starts = 0;
  let resumes = 0;
  let submissionKey: string | undefined;
  let operationId: Digest | undefined;
  const endpoint: ProviderEndpoint = {
    start({ operation }) {
      starts += 1;
      submissionKey = operation.submissionKey;
      operationId = operation.id;
      throw new Error("process stopped after the remote submit");
    },
    resume({ operation, checkpoint }) {
      resumes += 1;
      assert.equal(checkpoint, undefined);
      assert.equal(operation.submissionKey, submissionKey);
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Recovered by idempotency key" },
          conformance: "exact",
          delivery: "executed",
          metadata: { recovered: true },
        },
      };
    },
  };

  const firstExecutor = recoverableExecutor(endpoint, operations, runtime).executor;
  const [first] = await new LocalBuildScheduler(
    firstExecutor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{ id: "video", state: createGreetingBuild() }]);
  assert.equal(first?.status, "paused");
  assert.match(first?.journal.at(-1)?.message ?? "", /process stopped/u);
  assert.equal(starts, 1);
  // An exception happens before the Scheduler sees the Operation id, but OperationStore already has it.
  assert.ok(operationId);
  assert.equal((await operations.read(operationId))?.status, "created");

  const secondExecutor = recoverableExecutor(endpoint, operations, runtime).executor;
  const [second] = await new LocalBuildScheduler(
    secondExecutor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{
    id: "video",
    state: parseBuildState(serializeBuildState(first!.state)),
  }]);
  assert.equal(second?.status, "complete");
  assert.equal(starts, 1);
  assert.equal(resumes, 1);
});

test("a completion journaled before a crash is replayed into Core without calling the Endpoint again", async () => {
  const operations = new MemoryOperationStore();
  const runtime = resolvedRuntime(1);
  let starts = 0;
  let resumes = 0;
  let crashOnce = true;
  const crashingStore: OperationStore = {
    create: (identity) => operations.create(identity),
    read: (id) => operations.read(id),
    async compareAndSwap(id, revision, update) {
      const result = await operations.compareAndSwap(id, revision, update);
      if (update.status === "completed" && crashOnce) {
        crashOnce = false;
        throw new Error("process stopped after completion was journaled");
      }
      return result;
    },
  };
  const endpoint: ProviderEndpoint = {
    start() {
      starts += 1;
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Journaled completion" },
          conformance: "exact",
          delivery: "executed",
          metadata: { remoteJob: "job-complete" },
        },
      };
    },
    resume() {
      resumes += 1;
      throw new Error("a completed Operation must never resume");
    },
  };

  const [first] = await new LocalBuildScheduler(
    recoverableExecutor(endpoint, crashingStore, runtime).executor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{ id: "video", state: createGreetingBuild() }]);
  assert.equal(first?.status, "paused");
  assert.equal(first?.state.receipts.length, 0);
  assert.match(first?.journal.at(-1)?.message ?? "", /completion was journaled/u);
  assert.equal(starts, 1);

  const [second] = await new LocalBuildScheduler(
    recoverableExecutor(endpoint, operations, runtime).executor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{
    id: "video",
    state: parseBuildState(serializeBuildState(first!.state)),
  }]);
  assert.equal(second?.status, "complete");
  assert.equal(second?.state.receipts[0]?.metadata !== undefined, true);
  assert.equal(starts, 1);
  assert.equal(resumes, 0);
});
