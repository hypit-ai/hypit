import assert from "node:assert/strict";
import test from "node:test";

import {
  ProducerRegistry,
  NodeDriver,
  parseBuildState,
  EndpointRegistry,
  serializeBuildState,
} from "@svml/driver-node";
import type {
  RecoverableEndpoint,
  RuntimeEndpointImplementation,
} from "@svml/endpoint-kit";
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
  producers as greetingProducers,
  types,
} from "../../core/test/greeting-fixture.js";

function createParallelGreetingBuild(generationCount = 2) {
  const generations = ["a", "b", "c"].slice(0, generationCount);
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
        semanticInputs: [{ kind: "record", id: "intent:root" }],
      },
      ...generations.map((suffix) => ({
        id: `generated-${suffix}`,
        type: types.generated,
        primary: `generate-${suffix}`,
        semanticInputs: [{ kind: "logical-output" as const, id: "prompt" }],
      })),
    ],
    candidates: [
      {
        id: "make-prompt",
        type: types.prompt,
        root: { kind: "operation", result: { kind: "operation-result", operation: "make-prompt" } },
      },
      ...generations.map((suffix) => ({
        id: `generate-${suffix}`,
        type: types.generated,
        root: {
          kind: "operation" as const,
          result: { kind: "operation-result" as const, operation: `generate-${suffix}` },
        },
      })),
    ],
    operations: [
      {
        id: "make-prompt",
        producer: greetingProducers.makePrompt,
        inputs: { intent: { kind: "record", id: "intent:root" } },
        result: { kind: "output", name: "prompt", record: "prompt:root" },
      },
      ...generations.map((suffix) => ({
        id: `generate-${suffix}`,
        producer: greetingProducers.requestText,
        inputs: { prompt: { kind: "logical-output" as const, id: "prompt" } },
        result: {
          kind: "need" as const,
          name: "generation",
          id: `need:generation-${suffix}`,
          record: `generated:${suffix}`,
          accepts: "exact" as const,
        },
      })),
    ],
  });
  return start(program, graph, sealBuildRequest({
    graph: graph.id,
    targets: generations.map((suffix) => ({ output: `generated-${suffix}`, accepts: "exact" as const })),
    satisfactions: [],
  }));
}

function configuredExecutor(options: {
  readonly lane: string;
  readonly defaultConcurrency: number;
  readonly observe: (active: number) => void;
  readonly runtimeImplementation?: RuntimeEndpointImplementation;
  readonly endpointId?: string;
}) {
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  registerGreetingProducers(producers);
  let active = 0;
  let calls = 0;
  endpoints.registerImmediateEndpoint(
    options.endpointId ?? "fixture.seedance",
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
  return { executor: new NodeDriver({ producers, endpoints }), endpoints, getCalls: () => calls };
}

function registerGreetingProducers(producers: ProducerRegistry): void {
  producers.registerProducer(greetingProducers.makePrompt, implementationDigests.makePrompt, ({ inputs }) => {
    const intent = inputs.intent;
    assert.equal(intent?.value.kind, "inline");
    const name = (intent.value.value as { readonly name: string }).name;
    return { outputs: { prompt: { kind: "inline", value: `Greet ${name}` } }, needs: {} };
  });
  producers.registerProducer(greetingProducers.requestText, implementationDigests.requestText, ({ inputs }) => {
    const prompt = inputs.prompt;
    assert.equal(prompt?.value.kind, "inline");
    return { outputs: {}, needs: { generation: { prompt: prompt.value.value } } };
  });
  producers.registerProducer(greetingProducers.assemble, implementationDigests.assemble, ({ inputs }) => {
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

function resolvedRuntime(laneLimit: number, lifecycle: "immediate" | "recoverable" = "immediate") {
  const manifest: RuntimeModuleManifest = {
    format: "svml.runtime-module@2",
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
        role: "capability-endpoint",
        implementation: {
          locator: "example.scheduler-runtime/generation-endpoint",
          digest: providerImplementationDigest,
        },
        permissions: [],
        fulfills: [{ capability: capabilities.generation, returns: types.generated }],
        lifecycle,
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
      { id: "generation.local", facet: providerFacet, lane: "endpoint:generation.local" },
    ],
    scheduler: "scheduler.local",
    stores: { operations: "operations.memory" },
    endpoints: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "generation.local",
    }],
    scheduling: {
      maxConcurrency: 8,
      lanes: [{ name: "endpoint:generation.local", maxConcurrency: laneLimit }],
    },
  }));
  return { closure, modules };
}

function recoverableExecutor(
  endpoint: RecoverableEndpoint,
  operations: OperationStore,
  runtime = resolvedRuntime(1, "recoverable"),
  retry?: { readonly maxAttempts: number },
) {
  const producers = new ProducerRegistry();
  registerGreetingProducers(producers);
  const endpoints = new EndpointRegistry();
  endpoints.registerRecoverableEndpoint(
    "generation.local",
    capabilities.generation,
    types.generated,
    endpoint,
    {
      runtimeImplementation: {
        facet: providerFacet,
        digest: providerImplementationDigest,
        configurationDigest: digestOf({}),
      },
      ...(retry === undefined ? {} : { retry }),
    },
  );
  endpoints.applyRuntimeClosure(runtime.closure, runtime.modules);
  return {
    executor: new NodeDriver({ producers, endpoints, operations }),
    runtime,
  };
}

test("one local Scheduler shares an Endpoint lane across multiple Builds", async () => {
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
  assert.equal(result?.state.derivations.filter((item) => item.producer.name === greetingProducers.makePrompt.name).length, 1);
  assert.equal(result?.state.receipts.length, 2);
});

test("durable scheduling keeps the rest of an in-flight command batch after one event is stored", async () => {
  let maximumActive = 0;
  const { executor, getCalls } = configuredExecutor({
    lane: "seedance:fixture.account",
    defaultConcurrency: 2,
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  const store = new MemoryBuildStore();
  const [result] = await new LocalBuildScheduler(executor, {
    buildStore: store,
    maxConcurrency: 8,
  }).run([{
    id: "durable-two-shots",
    state: createParallelGreetingBuild(),
  }]);

  assert.equal(result?.status, "complete");
  assert.equal(getCalls(), 2);
  assert.equal(maximumActive, 2);
  assert.equal(result?.journal.some((entry) =>
    entry.status === "error" && entry.message?.includes("event references command")), false);
  assert.equal((await store.read("durable-two-shots"))?.state.status, "complete");
});

test("durable scheduling can drain successful sibling commands after another sibling errors", async () => {
  const producers = new ProducerRegistry();
  producers.registerProducer(greetingProducers.makePrompt, implementationDigests.makePrompt, ({ inputs }) => {
    const intent = inputs.intent;
    assert.equal(intent?.value.kind, "inline");
    return { outputs: { prompt: { kind: "inline", value: "Greet Ada" } }, needs: {} };
  });
  let calls = 0;
  producers.registerProducer(greetingProducers.requestText, implementationDigests.requestText, async () => {
    calls += 1;
    const call = calls;
    if (call === 1) throw new Error("fixture producer failed");
    await new Promise<void>((resolve) => setTimeout(resolve, call * 5));
    return { outputs: {}, needs: { generation: { prompt: `request ${call}` } } };
  });
  const store = new MemoryBuildStore();
  const [result] = await new LocalBuildScheduler(new NodeDriver({ producers }), {
    buildStore: store,
    maxConcurrency: 8,
  }).run([{
    id: "durable-error-with-siblings",
    state: createParallelGreetingBuild(3),
  }]);

  assert.equal(result?.status, "paused");
  assert.equal(calls, 3);
  assert.equal(result?.journal.filter((entry) => entry.status === "completed"
    && entry.kind === "invoke-producer").length, 3, "the prompt and both successful requests are accepted");
  assert.equal(result?.journal.some((entry) =>
    entry.status === "error" && entry.message?.includes("event references command")), false);
  assert.equal(result?.state.derivations.filter((item) =>
    item.producer.name === greetingProducers.requestText.name).length, 2);
});

test("a locked Runtime Closure assembles exact Endpoint code and Scheduler policy without manual bind", async () => {
  let maximumActive = 0;
  const { closure, modules } = resolvedRuntime(2);
  const { executor, endpoints } = configuredExecutor({
    lane: "ignored-registration-lane",
    defaultConcurrency: 1,
    runtimeImplementation: {
      facet: providerFacet,
      digest: providerImplementationDigest,
      configurationDigest: digestOf({}),
    },
    endpointId: "generation.local",
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  endpoints.applyRuntimeClosure(closure, modules);
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

test("a same-name Endpoint with different implementation bytes is rejected before execution", () => {
  const { closure, modules } = resolvedRuntime(1);
  const { endpoints, getCalls } = configuredExecutor({
    lane: "endpoint:generation.local",
    defaultConcurrency: 1,
    runtimeImplementation: {
      facet: providerFacet,
      digest: digestOf("tampered-endpoint-implementation"),
      configurationDigest: digestOf({}),
    },
    endpointId: "generation.local",
    observe() {},
  });
  assert.throws(() => endpoints.applyRuntimeClosure(closure, modules), /implementation does not match/u);
  assert.equal(getCalls(), 0);
});

test("a same-name Endpoint with different configured-instance identity is rejected", () => {
  const { closure, modules } = resolvedRuntime(1);
  const { endpoints, getCalls } = configuredExecutor({
    lane: "endpoint:generation.local",
    defaultConcurrency: 1,
    runtimeImplementation: {
      facet: providerFacet,
      digest: providerImplementationDigest,
      configurationDigest: digestOf({ baseUrl: "https://another-endpoint.test" }),
    },
    endpointId: "generation.local",
    observe() {},
  });
  assert.throws(() => endpoints.applyRuntimeClosure(closure, modules), /implementation does not match/u);
  assert.equal(getCalls(), 0);
});

test("a recoverable Runtime facet cannot be activated by a one-shot Handler", () => {
  const { closure, modules } = resolvedRuntime(1, "recoverable");
  const { endpoints, getCalls } = configuredExecutor({
    lane: "endpoint:generation.local",
    defaultConcurrency: 1,
    runtimeImplementation: {
      facet: providerFacet,
      digest: providerImplementationDigest,
      configurationDigest: digestOf({}),
    },
    endpointId: "generation.local",
    observe() {},
  });
  assert.throws(() => endpoints.applyRuntimeClosure(closure, modules), /lifecycle does not match/u);
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
  const runtime = resolvedRuntime(1, "recoverable");
  let starts = 0;
  let resumes = 0;
  let submissionKey: string | undefined;
  const endpoint: RecoverableEndpoint = {
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
  const runtime = resolvedRuntime(1, "recoverable");
  let starts = 0;
  let resumes = 0;
  let submissionKey: string | undefined;
  let operationId: Digest | undefined;
  const endpoint: RecoverableEndpoint = {
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
  const runtime = resolvedRuntime(1, "recoverable");
  let starts = 0;
  let resumes = 0;
  let crashOnce = true;
  const crashingStore: OperationStore = {
    create: (identity) => operations.create(identity),
    read: (id) => operations.read(id),
    list: (query) => operations.list(query),
    async compareAndSwap(id, revision, update) {
      const result = await operations.compareAndSwap(id, revision, update);
      if (update.status === "completed" && crashOnce) {
        crashOnce = false;
        throw new Error("process stopped after completion was journaled");
      }
      return result;
    },
  };
  const endpoint: RecoverableEndpoint = {
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

test("a retryable terminal failure creates a new attempt and submission key", async () => {
  const operations = new MemoryOperationStore();
  const runtime = resolvedRuntime(1, "recoverable");
  const attempts: number[] = [];
  const keys: string[] = [];
  const endpoint: RecoverableEndpoint = {
    start({ operation }) {
      attempts.push(operation.attempt);
      keys.push(operation.submissionKey);
      if (operation.attempt === 1) {
        return {
          status: "failed",
          failure: { code: "RATE_LIMITED", message: "retry this request", retryable: true, retryAt: 0 },
        };
      }
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Succeeded on attempt two" },
          conformance: "exact",
          delivery: "executed",
          metadata: {},
        },
      };
    },
    resume() {
      throw new Error("terminal attempts must not resume");
    },
  };
  const executor = recoverableExecutor(endpoint, operations, runtime, { maxAttempts: 2 }).executor;
  const [first] = await new LocalBuildScheduler(executor, {
    ...localSchedulerOptionsFromClosure(runtime.closure),
  }).run([{ id: "retry-video", state: createGreetingBuild() }]);
  assert.equal(first?.status, "paused");
  assert.deepEqual(attempts, [1]);

  const [second] = await new LocalBuildScheduler(executor, {
    ...localSchedulerOptionsFromClosure(runtime.closure),
  }).run([{ id: "retry-video", state: first!.state }]);
  assert.equal(second?.status, "complete");
  assert.deepEqual(attempts, [1, 2]);
  assert.notEqual(keys[0], keys[1]);
  assert.deepEqual((await operations.list({ build: "retry-video" })).map((item) => item.status), [
    "failed",
    "completed",
  ]);
});

test("wakeAt prevents early polling and Runtime cancellation becomes a terminal Core failure", async () => {
  const operations = new MemoryOperationStore();
  const runtime = resolvedRuntime(1, "recoverable");
  let resumes = 0;
  let cancels = 0;
  const wakeAt = Date.now() + 60_000;
  const endpoint: RecoverableEndpoint = {
    start() {
      return { status: "pending", checkpoint: { remoteJob: "job-wait" }, wakeAt };
    },
    resume() {
      resumes += 1;
      throw new Error("wakeAt must stop early polling");
    },
    cancel({ checkpoint }) {
      cancels += 1;
      assert.deepEqual(checkpoint, { remoteJob: "job-wait" });
    },
  };
  const executor = recoverableExecutor(endpoint, operations, runtime).executor;
  const scheduler = new LocalBuildScheduler(executor, localSchedulerOptionsFromClosure(runtime.closure));
  const [first] = await scheduler.run([{ id: "cancel-video", state: createGreetingBuild() }]);
  const operationId = first?.journal.find((item) => item.status === "pending")?.operation;
  assert.ok(operationId);

  const [early] = await scheduler.run([{ id: "cancel-video", state: first!.state }]);
  assert.equal(early?.journal.at(-1)?.wakeAt, wakeAt);
  assert.equal(resumes, 0);

  const operation = await operations.read(operationId);
  assert.ok(operation);
  await executor.cancelOperation(early!.state, operation);
  assert.equal(cancels, 1);
  const [cancelled] = await scheduler.run([{ id: "cancel-video", state: early!.state }]);
  assert.equal(cancelled?.status, "failed");
  assert.equal(cancelled?.state.diagnostics.at(-1)?.code, "CANCELLED");
});
