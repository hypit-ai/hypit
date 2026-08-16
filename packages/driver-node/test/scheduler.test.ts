import assert from "node:assert/strict";
import test from "node:test";

import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
} from "@narratage/driver-node";
import type { AsyncEndpoint } from "@narratage/endpoint-kit";
import {
  LocalBuildScheduler,
  MemoryOperationStore,
  RuntimeModuleRegistry,
  localSchedulerOptionsFromClosure,
  resolveRuntimeClosure,
  sealResolvedRuntimeProfile,
} from "@narratage/runtime";
import type {
  OperationStore,
  RuntimeModuleManifest,
} from "@narratage/runtime";
import {
  createResolvedClosure,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
} from "@narratage/core";

import { capabilities, createGreetingBuild, manifest, producers as greetingProducers, types } from "../../core/test/greeting-fixture.js";

function createParallelGreetingBuild(generationCount = 2) {
  const generations = ["a", "b", "c"].slice(0, generationCount);
  const closure = createResolvedClosure([manifest]);
  const authored = sealRecord({
    id: "intent:root",
    type: types.intent,
    value: { kind: "inline", value: { name: "Ada" } },
  });
  const program = link(closure, [authored]);
  const graph = sealCompiledGraph({
    outputs: [
      {
        id: "prompt",
        type: types.prompt,
        primary: "make-prompt",
      },
      ...generations.map((suffix) => ({
        id: `generated-${suffix}`,
        type: types.generated,
        primary: `generate-${suffix}`,
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
        },
      })),
    ],
  });
  return start(program, graph, sealBuildRequest({
    targets: generations.map((suffix) => ({ output: `generated-${suffix}` })),
  }));
}

function configuredExecutor(options: {
  readonly resource: string;
  readonly defaultConcurrency: number;
  readonly observe: (active: number) => void;
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
      };
    },
    {
      scheduling: {
        resources: [{
          id: options.resource,
          maxActive: options.defaultConcurrency,
          maxInFlight: options.defaultConcurrency,
        }],
      },
    },
  );
  return { executor: new NodeDriver({ producers, endpoints }), endpoints, getCalls: () => calls };
}

function registerGreetingProducers(producers: ProducerRegistry): void {
  producers.registerProducer(greetingProducers.makePrompt, ({ inputs }) => {
    const intent = inputs.intent;
    assert.equal(intent?.value.kind, "inline");
    const name = (intent.value.value as { readonly name: string }).name;
    return { outputs: { prompt: { kind: "inline", value: `Greet ${name}` } }, needs: {} };
  });
  producers.registerProducer(greetingProducers.requestText, ({ inputs }) => {
    const prompt = inputs.prompt;
    assert.equal(prompt?.value.kind, "inline");
    return { outputs: {}, needs: { generation: { prompt: prompt.value.value } } };
  });
  producers.registerProducer(greetingProducers.assemble, ({ inputs }) => {
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
function resolvedRuntime(laneLimit: number, lifecycle: "immediate" | "asynchronous" = "immediate") {
  const manifest: RuntimeModuleManifest = {
    format: "narratage.runtime-module@1",
    name: runtimeModule.name,
    version: runtimeModule.version,
    facets: [
      {
        name: "scheduler",
        role: "scheduler",
      },
      {
        name: "operations",
        role: "operation-store",
      },
      ...([
        ["worker", "worker"],
        ["builds", "build-store"],
        ["dispatch", "dispatch-store"],
        ["artifacts", "artifact-store"],
        ["credentials", "credential-store"],
      ] as const).map(([name, role]) => ({
        name,
        role,
      })),
      {
        name: providerFacet.name,
        role: "capability-endpoint",
        fulfills: [{ capability: capabilities.generation, returns: types.generated }],
        lifecycle,
        defaultConcurrency: 1,
      },
    ],
  };
  const modules = new RuntimeModuleRegistry();
  modules.register(manifest);
  const closure = resolveRuntimeClosure(modules, sealResolvedRuntimeProfile({
    instances: [
      { id: "scheduler.local", facet: { module: runtimeModule, name: "scheduler" } },
      { id: "worker.local", facet: { module: runtimeModule, name: "worker" } },
      { id: "builds.memory", facet: { module: runtimeModule, name: "builds" } },
      { id: "operations.memory", facet: { module: runtimeModule, name: "operations" } },
      { id: "dispatch.memory", facet: { module: runtimeModule, name: "dispatch" } },
      { id: "artifacts.memory", facet: { module: runtimeModule, name: "artifacts" } },
      { id: "credentials.memory", facet: { module: runtimeModule, name: "credentials" } },
      { id: "generation.local", facet: providerFacet, pool: "fixture.account" },
    ],
    scheduler: "scheduler.local",
    worker: "worker.local",
    stores: {
      build: "builds.memory",
      operations: "operations.memory",
      dispatch: "dispatch.memory",
      artifacts: "artifacts.memory",
      credentials: ["credentials.memory"],
    },
    endpoints: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "generation.local",
    }],
    scheduling: {
      maxConcurrency: 8,
      resources: [
        { id: "pool:fixture.account", maxConcurrency: laneLimit },
        {
          id: `lane:fixture.account/${capabilities.generation.module.name}@${capabilities.generation.module.version}#${capabilities.generation.name}`,
          maxConcurrency: laneLimit,
        },
      ],
    },
  }));
  return { closure, modules };
}

function asyncExecutor(
  endpoint: AsyncEndpoint,
  operations: OperationStore,
  runtime = resolvedRuntime(1, "asynchronous"),
) {
  const producers = new ProducerRegistry();
  registerGreetingProducers(producers);
  const endpoints = new EndpointRegistry();
  endpoints.registerAsyncEndpoint(
    "generation.local",
    capabilities.generation,
    types.generated,
    endpoint,
  );
  endpoints.applyRuntimeClosure(runtime.closure, runtime.modules);
  return {
    executor: new NodeDriver({ producers, endpoints, operations }),
    runtime,
  };
}

test("one local Scheduler shares an Endpoint resource across multiple Builds", async () => {
  let maximumActive = 0;
  const { executor, getCalls } = configuredExecutor({
    resource: "pool:fixture.account",
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
    result.outcomes.some((entry) => entry.resources.includes("pool:fixture.account"))), true);
});

test("a Resolved Runtime resource override changes parallelism", async () => {
  let maximumActive = 0;
  const resource = "pool:fixture.account";
  const { executor } = configuredExecutor({
    resource,
    defaultConcurrency: 1,
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  const initial = createGreetingBuild();
  const scheduler = new LocalBuildScheduler(executor, {
    maxConcurrency: 8,
    resourceLimits: { [resource]: 2 },
  });
  const results = await scheduler.run([
    { id: "video-a", state: initial },
    { id: "video-b", state: initial },
  ]);

  assert.deepEqual(results.map((result) => result.status), ["complete", "complete"]);
  assert.equal(maximumActive, 2);
});

test("independent paid commands inside one Build may fill the same resource without duplicating their shared upstream", async () => {
  let maximumActive = 0;
  const { executor, getCalls } = configuredExecutor({
    resource: "pool:fixture.account",
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
  assert.equal(result?.state.plan.steps.filter((step) =>
    step.producer.name === greetingProducers.makePrompt.name).length, 1);
  assert.equal(result?.state.records.filter((record) =>
    record.type.name === types.generated.name).length, 2);
});

test("a resolved Runtime selects an Endpoint and Scheduler policy without manual bind", async () => {
  let maximumActive = 0;
  const { closure, modules } = resolvedRuntime(2);
  const { executor, endpoints } = configuredExecutor({
    resource: "pool:ignored-registration",
    defaultConcurrency: 1,
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
  assert.equal(maximumActive, 2, "the selected Profile override owns the resource");
  assert.equal(results.every((result) =>
    result.state.records.some((record) => record.id === "generated:root")), true);
});

test("a asynchronous Runtime facet cannot be activated by a one-shot Handler", () => {
  const { closure, modules } = resolvedRuntime(1, "asynchronous");
  const { endpoints } = configuredExecutor({
    resource: "pool:fixture.account",
    defaultConcurrency: 1,
    endpointId: "generation.local",
    observe() {},
  });
  assert.throws(() => endpoints.applyRuntimeClosure(closure, modules), /lifecycle does not match/u);
});

test("a asynchronous Endpoint starts once and is polled until complete", async () => {
  const operations = new MemoryOperationStore();
  const runtime = resolvedRuntime(1, "asynchronous");
  let starts = 0;
  let resumes = 0;
  let operationId: string | undefined;
  const endpoint: AsyncEndpoint = {
    start({ operation }) {
      starts += 1;
      operationId = operation;
      return { status: "pending", handle: { remoteJob: "job-1" } };
    },
    poll({ operation, handle }) {
      resumes += 1;
      assert.equal(operation, operationId);
      assert.deepEqual(handle, { remoteJob: "job-1" });
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Hello after polling" },
        },
      };
    },
  };

  const firstExecutor = asyncExecutor(endpoint, operations, runtime).executor;
  const [first] = await new LocalBuildScheduler(
    firstExecutor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{ id: "video", state: createGreetingBuild() }]);
  assert.equal(first?.status, "paused");
  assert.equal(starts, 1);
  assert.equal(resumes, 0);
  assert.equal(first?.state.records.some((record) => record.id === "generated:root"), false);
  const pending = first?.outcomes.find((entry) => entry.status === "pending");
  assert.ok(pending?.operation);
  assert.equal((await operations.read(pending.operation))?.status, "pending");

  const secondExecutor = asyncExecutor(endpoint, operations, runtime).executor;
  const [second] = await new LocalBuildScheduler(
    secondExecutor,
    localSchedulerOptionsFromClosure(runtime.closure),
  ).run([{ id: "video", state: createGreetingBuild() }]);

  assert.equal(second?.status, "complete");
  assert.equal(starts, 1);
  assert.equal(resumes, 1);
  assert.equal((await operations.read(pending.operation))?.status, "completed");
});

test("wakeAt prevents early polling and Runtime cancellation becomes a terminal Core failure", async () => {
  const operations = new MemoryOperationStore();
  const runtime = resolvedRuntime(1, "asynchronous");
  let resumes = 0;
  let cancels = 0;
  const wakeAt = Date.now() + 60_000;
  const endpoint: AsyncEndpoint = {
    start() {
      return { status: "pending", handle: { remoteJob: "job-wait" }, wakeAt };
    },
    poll() {
      resumes += 1;
      throw new Error("wakeAt must stop early polling");
    },
    cancel({ handle }) {
      cancels += 1;
      assert.deepEqual(handle, { remoteJob: "job-wait" });
      return { status: "confirmed" };
    },
  };
  const executor = asyncExecutor(endpoint, operations, runtime).executor;
  const scheduler = new LocalBuildScheduler(executor, localSchedulerOptionsFromClosure(runtime.closure));
  const [first] = await scheduler.run([{ id: "cancel-video", state: createGreetingBuild() }]);
  const operationId = first?.outcomes.find((item) => item.status === "pending")?.operation;
  assert.ok(operationId);

  const [early] = await scheduler.run([{ id: "cancel-video", state: first!.state }]);
  assert.equal(early?.outcomes.at(-1)?.wakeAt, wakeAt);
  assert.equal(resumes, 0);

  const operation = await operations.read(operationId);
  assert.ok(operation);
  await executor.cancelOperation(early!.state, operation);
  assert.equal(cancels, 1);
  const [cancelled] = await scheduler.run([{ id: "cancel-video", state: early!.state }]);
  assert.equal(cancelled?.status, "failed");
  assert.equal(cancelled?.state.diagnostics.at(-1)?.code, "CANCELLED");
});
