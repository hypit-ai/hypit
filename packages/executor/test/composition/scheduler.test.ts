import assert from "node:assert/strict";
import test from "node:test";

// This suite verifies the Runtime scheduler and Executor boundary.

import {
  ProducerRegistry,
  Executor,
  EndpointRegistry,
} from "@hypit/executor";
import type { AsyncEndpoint } from "@hypit/endpoint";
import {
  applyOperationUpdate,
  InProcessBuildScheduler,
} from "@hypit/runtime";
import type { BuildStore, OperationSnapshot, OperationStore, OperationUpdate, RuntimeCommandExecutor, RuntimeExecutionContext, ScheduledBuild, ScheduledBuildResult } from "@hypit/runtime";
import type { BuildState } from "@hypit/protocol";
import { capabilities, createGreetingBuild, createParallelGreetingBuild, producers as greetingProducers, types } from "../execution-scenario.js";
import { completeChainStep, createChainDefinition } from "../execution-scenario.js";

function submission(id: string, state: BuildState): ScheduledBuild {
  return {
    id,
    definition: { format: "hypit.build-definition@1", program: state.program, plan: state.plan },
    facts: [],
  };
}

function continuation(result: ScheduledBuildResult): ScheduledBuild {
  return { id: result.id, definition: result.definition, facts: result.facts };
}

function memoryOperations(): OperationStore {
  const values = new Map<string, OperationSnapshot>();
  return {
    async create(operation) {
      values.set(operation.id, structuredClone(operation));
      return structuredClone(operation);
    },
    async read(id) {
      const value = values.get(id);
      return value === undefined ? undefined : structuredClone(value);
    },
    async list(query) {
      return [...values.values()].filter((item) =>
        (query.build === undefined || item.build === query.build)
        && (query.command === undefined || item.command === query.command)
        && (query.endpoint === undefined || item.endpoint === query.endpoint));
    },
    async update(id, update: OperationUpdate) {
      const current = values.get(id);
      if (current === undefined) throw new Error(`Operation ${id} does not exist`);
      const next = applyOperationUpdate(current, structuredClone(update));
      values.set(id, next);
      return structuredClone(next);
    },
  };
}

test("a durable Scheduler keeps preparation and Record lookup on the indexed Build execution path", async () => {
  const definition = createChainDefinition(1);
  let appends = 0;
  const builds: BuildStore = {
    async create() { throw new Error("unused"); },
    async read() { throw new Error("unused"); },
    async append(_build, fact) {
      appends++;
      assert.equal(fact.kind, "producer-applied");
    },
  };
  let preparations = 0;
  let executions = 0;
  const executor: RuntimeCommandExecutor = {
    prepare(execution) {
      preparations++;
      return {
        state: execution.view(),
        runnable: execution.commands().map((command) => ({ command, resources: [] })),
        blocked: [],
      };
    },
    async executeCommand(execution, descriptor) {
      executions++;
      assert.equal(descriptor.command.kind, "invoke-producer");
      return { status: "completed", event: completeChainStep(descriptor.command) };
    },
  };
  const [result] = await new InProcessBuildScheduler(executor, { buildStore: builds }).run([{
    id: "indexed-chain",
    definition,
    facts: [],
  }]);
  assert.equal(result?.status, "complete");
  assert.equal(preparations, 1);
  assert.equal(executions, 1);
  assert.equal(appends, 1);
});


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
        value: (`Generated ${calls}`),
      };
    },
    {
      scheduling: {
        resources: [{
          id: options.resource,
          limit: options.defaultConcurrency,
        }],
      },
    },
  );
  return { executor: new Executor({ producers, endpoints }), endpoints, getCalls: () => calls };
}

function registerGreetingProducers(producers: ProducerRegistry): void {
  producers.registerProducer(greetingProducers.makePrompt, ({ inputs }) => {
    const intent = inputs.intent!;
    const name = (intent.value as { readonly name: string }).name;
    return { kind: "output", value: (`Greet ${name}`) };
  });
  producers.registerProducer(greetingProducers.requestText, ({ inputs }) => {
    const prompt = inputs.prompt!;
    return { kind: "need", constraints: { prompt: prompt.value } };
  });
  producers.registerProducer(greetingProducers.assemble, ({ inputs }) => {
    const generated = inputs.generated!;
    return { kind: "output", value: ({ text: generated.value }) };
  });
}

function asyncExecutor(
  endpoint: AsyncEndpoint,
  operations: OperationStore,
) {
  const producers = new ProducerRegistry();
  registerGreetingProducers(producers);
  const endpoints = new EndpointRegistry();
  endpoints.registerAsyncEndpoint(
    "generation.local",
    capabilities.generation,
    types.generated,
    endpoint,
    {
      scheduling: {
        resources: [
          { id: "pool:fixture.account", limit: 1 },
          { id: "capacity:fixture.account/generation", limit: 1 },
        ],
      },
    },
  );
  return new Executor({ producers, endpoints, operations });
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
  const scheduler = new InProcessBuildScheduler(executor);
  const results = await scheduler.run([
    submission("video-a", createGreetingBuild()),
    submission("video-b", createGreetingBuild()),
  ]);

  assert.deepEqual(results.map((result) => result.status), ["complete", "complete"]);
  assert.equal(getCalls(), 2);
  assert.equal(maximumActive, 1);
  assert.equal(results.every((result) =>
    result.outcomes.some((entry) => entry.resources.includes("pool:fixture.account"))), true);
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
  const [result] = await new InProcessBuildScheduler(executor).run([{
    ...submission("two-shots", createParallelGreetingBuild()),
  }]);

  assert.equal(result?.status, "complete");
  assert.equal(getCalls(), 2);
  assert.equal(maximumActive, 2);
  assert.equal(result?.state.plan.steps.filter((step) =>
    step.producer.name === greetingProducers.makePrompt.name).length, 1);
  assert.equal(result?.state.records.filter((record) =>
    record.type.name === types.generated.name).length, 2);
});

test("a failure stops new work and preserves a result from an already running sibling", async () => {
  const operations = memoryOperations();
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  registerGreetingProducers(producers);
  let calls = 0;
  const endpoint: AsyncEndpoint = {
    async start() {
      calls += 1;
      if (calls === 1) {
        return {
          status: "failed",
          failure: { code: "PROVIDER_REJECTED", message: "the first provider request was rejected" },
        };
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      return {
        status: "completed",
        result: "late sibling result",
      };
    },
    poll() {
      throw new Error("completed fixture operations are not polled");
    },
  };
  endpoints.registerAsyncEndpoint(
    "generation.parallel",
    capabilities.generation,
    types.generated,
    endpoint,
    { scheduling: { resources: [{ id: "pool:fixture.account", limit: 2 }] } },
  );

  const [result] = await new InProcessBuildScheduler(new Executor({ producers, endpoints, operations })).run([{
    ...submission("parallel-failure", createParallelGreetingBuild(3)),
  }]);

  assert.equal(calls, 2);
  assert.equal(result?.status, "failed");
  assert.equal(result?.state.diagnostics.at(-1)?.code, "PROVIDER_REJECTED");
  assert.match(result?.state.diagnostics.at(-1)?.message ?? "", /first provider request was rejected/);
  assert.equal(result?.outcomes.some((outcome) => outcome.status === "error"), false);
  assert.deepEqual(result?.state.records.find((record) => record.type.name === types.generated.name)?.value,
    ("late sibling result"));
});

test("an asynchronous Endpoint starts once and is polled until complete", async () => {
  const operations = memoryOperations();
  let starts = 0;
  let polls = 0;
  let operationId: string | undefined;
  const endpoint: AsyncEndpoint = {
    start({ operation }) {
      starts += 1;
      operationId = operation;
      return { status: "pending", handle: { remoteJob: "job-1" } };
    },
    poll({ operation, handle }) {
      polls += 1;
      assert.equal(operation, operationId);
      assert.deepEqual(handle, { remoteJob: "job-1" });
      return {
        status: "completed",
        result: {
          value: ("Hello after polling"),
        },
      };
    },
  };

  const firstExecutor = asyncExecutor(endpoint, operations);
  const [first] = await new InProcessBuildScheduler(firstExecutor)
    .run([submission("video", createGreetingBuild())]);
  assert.equal(first?.status, "paused");
  assert.equal(starts, 1);
  assert.equal(polls, 0);
  assert.equal(first?.state.records.some((record) => record.id === "generated:root"), false);
  const pending = first?.outcomes.find((entry) => entry.status === "pending");
  assert.ok(pending?.operation);
  assert.equal((await operations.read(pending.operation))?.status, "running");

  const secondExecutor = asyncExecutor(endpoint, operations);
  const [second] = await new InProcessBuildScheduler(secondExecutor)
    .run([continuation(first!)]);

  assert.equal(second?.status, "complete");
  assert.equal(starts, 1);
  assert.equal(polls, 1);
  assert.equal((await operations.read(pending.operation))?.status, "completed");
});

test("a persisted remote acknowledgement survives a later submission failure", async () => {
  const operations = memoryOperations();
  let starts = 0;
  let polls = 0;
  const endpoint: AsyncEndpoint = {
    async start(context) {
      starts += 1;
      await context.checkpoint?.({
        status: "accepted",
        handle: { remoteJob: "accepted-before-local-failure" },
        receipt: { id: "accepted-before-local-failure" },
      });
      throw new Error("local work failed after the remote acknowledgement");
    },
    poll({ handle }) {
      polls += 1;
      assert.deepEqual(handle, { remoteJob: "accepted-before-local-failure" });
      return { status: "completed", result: "recovered without another submission" };
    },
  };

  const firstExecutor = asyncExecutor(endpoint, operations);
  const [first] = await new InProcessBuildScheduler(firstExecutor)
    .run([submission("checkpointed-submission", createGreetingBuild())]);
  assert.equal(first?.status, "paused");
  assert.equal(starts, 1);
  const pending = first?.outcomes.find((entry) => entry.status === "pending");
  assert.ok(pending?.operation);
  const acknowledged = await operations.read(pending.operation);
  assert.equal(acknowledged?.status, "running");
  assert.deepEqual(acknowledged?.receipt, { id: "accepted-before-local-failure" });

  const secondExecutor = asyncExecutor(endpoint, operations);
  const [second] = await new InProcessBuildScheduler(secondExecutor).run([continuation(first!)]);
  assert.equal(second?.status, "complete");
  assert.equal(starts, 1);
  assert.equal(polls, 1);
});

test("asynchronous actions expose progress before returning without treating it as acknowledgement", async () => {
  const operations = memoryOperations();
  const progress: unknown[] = [];
  const log: unknown[] = [];
  let reportReady!: () => void;
  let finishAction!: () => void;
  const reported = new Promise<void>((resolve) => { reportReady = resolve; });
  const finish = new Promise<void>((resolve) => { finishAction = resolve; });
  const executor = asyncExecutor({
    async start(context) {
      await context.reportProgress?.({ phase: "Preparing inputs", completed: 0, total: 2, unit: "files" });
      await context.reportProgress?.({ phase: "Preparing inputs", completed: 1, total: 2, unit: "files" });
      reportReady();
      await finish;
      return { status: "pending", handle: { job: "one" }, receipt: { id: "one" } };
    },
    async poll(context) {
      await context.reportProgress?.({ phase: "Reading remote result" });
      return { status: "ready", handle: context.handle };
    },
    async collect(context) {
      await context.reportProgress?.({ phase: "Receiving output" });
      return { status: "completed", result: "done" };
    },
  }, operations);
  const context: RuntimeExecutionContext = {
    build: "progress-build",
    reportProgress: async (value) => { progress.push(value); },
    recordExecution: async (value) => { log.push(value); },
  };
  const running = new InProcessBuildScheduler(executor, {
    executionContext: () => ({
      reportProgress: context.reportProgress!,
      recordExecution: context.recordExecution!,
    }),
  }).run([submission(context.build, createGreetingBuild())]);
  try {
    await reported;
    assert.deepEqual(progress, [0, 1].map((completed) => ({ endpoint: "generation.local",
      progress: { phase: "Preparing inputs", completed, total: 2, unit: "files" },
    })));
    assert.deepEqual(log, [
      { endpoint: "generation.local", kind: "started" },
      { endpoint: "generation.local", kind: "phase", phase: "Preparing inputs" },
    ]);
    const [pending] = await operations.list({ build: context.build });
    assert.equal(pending!.status, "submitting");
    assert.equal(pending!.receipt, undefined);
  } finally { finishAction(); }
  await running;
  const [submitted] = await operations.list({ build: context.build });
  assert.equal(submitted!.status, "running");
  assert.equal(submitted!.receipt!.id, "one");
  const ready = await executor.advanceOperation(submitted!, context);
  const received = await executor.advanceOperation(ready, context);
  assert.equal(received.status, "received");
  assert.deepEqual(received.value, "done");
  assert.deepEqual(progress.slice(2), ["Reading remote result", "Receiving output"].map((phase) => ({
    endpoint: "generation.local", progress: { phase },
  })));
});

test("a temporary collection failure keeps remote completion and retries collection", async () => {
  const operations = memoryOperations();
  let collections = 0;
  const executor = asyncExecutor({
    start: () => ({ status: "pending", handle: { job: "one" }, receipt: { id: "one" } }),
    poll: (context) => ({ status: "ready", handle: context.handle, receipt: { id: "one" } }),
    collect: (context) => {
      collections += 1;
      if (collections === 1) {
        return { status: "pending", handle: context.handle, progress: { phase: "retrying-collection" } };
      }
      return { status: "completed", result: "done", receipt: { id: "one" } };
    },
  }, operations);
  const [first] = await new InProcessBuildScheduler(executor).run([submission("video", createGreetingBuild())]);
  const operationId = first?.outcomes.find((entry) => entry.status === "pending")?.operation;
  assert.ok(operationId);
  const submitted = await operations.read(operationId);
  assert.ok(submitted);

  const ready = await executor.advanceOperation(submitted, { build: "video" });
  assert.equal(ready.status, "collecting");
  const retry = await executor.advanceOperation(ready, { build: "video" });
  assert.equal(retry.status, "collecting");
  assert.equal(retry.progress?.phase, "retrying-collection");
  const received = await executor.advanceOperation(retry, { build: "video" });
  assert.equal(collections, 2);
  assert.equal(received.status, "received");
  assert.deepEqual(received.value, "done");
});

test("a submission error ends its attempt and a new Build can submit normally", async () => {
  const operations = memoryOperations();
  let starts = 0;
  const endpoint: AsyncEndpoint = {
    start() {
      starts++;
      if (starts === 1) throw new Error("submission timed out without a receipt");
      return { status: "pending", handle: { job: "second" }, receipt: { id: "second" } };
    },
    poll() { return { status: "completed", result: "done" }; },
  };
  const scheduler = new InProcessBuildScheduler(asyncExecutor(endpoint, operations));
  const [failed] = await scheduler.run([submission("first", createGreetingBuild())]);
  assert.equal(failed?.status, "failed");
  assert.equal((await operations.list({ build: "first" }))[0]?.status, "failed");
  await scheduler.run([continuation(failed!)]);
  assert.equal(starts, 1);
  const [next] = await scheduler.run([submission("second", createGreetingBuild())]);
  const [completed] = await scheduler.run([continuation(next!)]);
  assert.equal(completed?.status, "complete");
  assert.equal(starts, 2);
});

test("wakeAt prevents early polling and Runtime cancellation becomes a terminal Core failure", async () => {
  const operations = memoryOperations();
  let polls = 0;
  let cancels = 0;
  const wakeAt = Date.now() + 60_000;
  const endpoint: AsyncEndpoint = {
    start() {
      return { status: "pending", handle: { remoteJob: "job-wait" }, wakeAt };
    },
    poll() {
      polls += 1;
      throw new Error("wakeAt must stop early polling");
    },
    cancel({ handle }) {
      cancels += 1;
      assert.deepEqual(handle, { remoteJob: "job-wait" });
      return { status: "confirmed" };
    },
  };
  const executor = asyncExecutor(endpoint, operations);
  const scheduler = new InProcessBuildScheduler(executor);
  const [first] = await scheduler.run([submission("cancel-video", createGreetingBuild())]);
  const operationId = first?.outcomes.find((item) => item.status === "pending")?.operation;
  assert.ok(operationId);

  const [early] = await scheduler.run([continuation(first!)]);
  assert.equal(early?.outcomes.at(-1)?.wakeAt, wakeAt);
  assert.equal(polls, 0);

  const operation = await operations.read(operationId);
  assert.ok(operation);
  await executor.cancelOperation(operation);
  assert.equal(cancels, 1);
  const [cancelled] = await scheduler.run([continuation(early!)]);
  assert.equal(cancelled?.status, "failed");
  assert.equal(cancelled?.state.diagnostics.at(-1)?.code, "CANCELLED");
});

test("request quantities govern concurrent admission, independent of whole-Need count", async () => {
  const producerRegistry = new ProducerRegistry();
  registerGreetingProducers(producerRegistry);
  const endpoints = new EndpointRegistry();
  let active = 0, maximum = 0;
  endpoints.registerImmediateEndpoint("weighted", capabilities.generation, types.generated, async () => {
    active += 4; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 4;
    return "done";
  }, { scheduling: { resources: [{ id: "browsers", limit: 6 }], unitsForRequest: () => ({ browsers: 4 }) } });
  const results = await new InProcessBuildScheduler(new Executor({ producers: producerRegistry, endpoints }))
    .run(["a", "b"].map((id) => submission(id, createGreetingBuild())));
  assert.ok(results.every((result) => result.status === "complete"));
  assert.equal(maximum, 4, "two four-worker requests cannot fit in six slots");
});

test("a poll transport error fails once and retains the acknowledged receipt", async () => {
  const operations = memoryOperations();
  let starts = 0, polls = 0;
  const endpoint: AsyncEndpoint = {
    start() { starts++; return { status: "pending", handle: { job: "one" }, receipt: { id: "one" } }; },
    poll() { polls++; throw new Error("connection lost"); },
  };
  const scheduler = new InProcessBuildScheduler(asyncExecutor(endpoint, operations));
  const [first] = await scheduler.run([submission("poll-error", createGreetingBuild())]);
  const [second] = await scheduler.run([continuation(first!)]);
  const [operation] = await operations.list({ build: "poll-error" });
  assert.equal(second?.status, "failed");
  assert.equal(operation?.status, "failed");
  assert.equal(operation?.receipt?.id, "one");
  assert.match(operation!.failure!.message, /connection lost/);
  await scheduler.run([continuation(second!)]);
  assert.equal(starts, 1);
  assert.equal(polls, 1);
});
