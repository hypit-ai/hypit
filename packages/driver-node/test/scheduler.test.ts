import assert from "node:assert/strict";
import test from "node:test";

import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
} from "@hypit/driver-node";
import type { AsyncEndpoint } from "@hypit/endpoint-kit";
import {
  LocalBuildScheduler,
} from "@hypit/runtime";
import type { OperationSnapshot, OperationStore, OperationUpdate } from "@hypit/runtime";
import { capabilities, createGreetingBuild, createParallelGreetingBuild, producers as greetingProducers, types } from "../../core/test/greeting-fixture.js";

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
      if (["completed", "failed", "cancelled"].includes(current.status)) return structuredClone(current);
      const next = {
        ...current,
        id: current.id,
        build: current.build,
        command: current.command,
        endpoint: current.endpoint,
        ...structuredClone(update),
      } as OperationSnapshot;
      if (update.status !== "pending" || update.wakeAt === undefined) delete (next as { wakeAt?: number }).wakeAt;
      values.set(id, next);
      return structuredClone(next);
    },
  };
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
          limit: options.defaultConcurrency,
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
  return new NodeDriver({ producers, endpoints, operations });
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
  const scheduler = new LocalBuildScheduler(executor);
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

test("independent paid commands inside one Build may fill the same resource without duplicating their shared upstream", async () => {
  let maximumActive = 0;
  const { executor, getCalls } = configuredExecutor({
    resource: "pool:fixture.account",
    defaultConcurrency: 2,
    observe(active) {
      maximumActive = Math.max(maximumActive, active);
    },
  });
  const [result] = await new LocalBuildScheduler(executor).run([{
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
        result: { value: { kind: "inline", value: "late sibling result" } },
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

  const [result] = await new LocalBuildScheduler(new NodeDriver({ producers, endpoints, operations })).run([{
    id: "parallel-failure",
    state: createParallelGreetingBuild(3),
  }]);

  assert.equal(calls, 2);
  assert.equal(result?.status, "failed");
  assert.equal(result?.state.diagnostics.at(-1)?.code, "PROVIDER_REJECTED");
  assert.match(result?.state.diagnostics.at(-1)?.message ?? "", /first provider request was rejected/);
  assert.equal(result?.outcomes.some((outcome) => outcome.status === "error"), false);
  assert.deepEqual(result?.state.records.find((record) => record.type.name === types.generated.name)?.value,
    { kind: "inline", value: "late sibling result" });
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
          value: { kind: "inline", value: "Hello after polling" },
        },
      };
    },
  };

  const firstExecutor = asyncExecutor(endpoint, operations);
  const [first] = await new LocalBuildScheduler(firstExecutor)
    .run([{ id: "video", state: createGreetingBuild() }]);
  assert.equal(first?.status, "paused");
  assert.equal(starts, 1);
  assert.equal(polls, 0);
  assert.equal(first?.state.records.some((record) => record.id === "generated:root"), false);
  const pending = first?.outcomes.find((entry) => entry.status === "pending");
  assert.ok(pending?.operation);
  assert.equal((await operations.read(pending.operation))?.status, "pending");

  const secondExecutor = asyncExecutor(endpoint, operations);
  const [second] = await new LocalBuildScheduler(secondExecutor)
    .run([{ id: "video", state: createGreetingBuild() }]);

  assert.equal(second?.status, "complete");
  assert.equal(starts, 1);
  assert.equal(polls, 1);
  assert.equal((await operations.read(pending.operation))?.status, "completed");
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
    poll() { return { status: "completed", result: { value: { kind: "inline", value: "done" } } }; },
  };
  const scheduler = new LocalBuildScheduler(asyncExecutor(endpoint, operations));
  const [failed] = await scheduler.run([{ id: "first", state: createGreetingBuild() }]);
  assert.equal(failed?.status, "failed");
  assert.equal((await operations.list({ build: "first" }))[0]?.status, "failed");
  await scheduler.run([{ id: "first", state: failed!.state }]);
  assert.equal(starts, 1);
  const [next] = await scheduler.run([{ id: "second", state: createGreetingBuild() }]);
  const [completed] = await scheduler.run([{ id: "second", state: next!.state }]);
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
  const scheduler = new LocalBuildScheduler(executor);
  const [first] = await scheduler.run([{ id: "cancel-video", state: createGreetingBuild() }]);
  const operationId = first?.outcomes.find((item) => item.status === "pending")?.operation;
  assert.ok(operationId);

  const [early] = await scheduler.run([{ id: "cancel-video", state: first!.state }]);
  assert.equal(early?.outcomes.at(-1)?.wakeAt, wakeAt);
  assert.equal(polls, 0);

  const operation = await operations.read(operationId);
  assert.ok(operation);
  await executor.cancelOperation(early!.state, operation);
  assert.equal(cancels, 1);
  const [cancelled] = await scheduler.run([{ id: "cancel-video", state: early!.state }]);
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
    return { value: { kind: "inline", value: "done" } };
  }, { scheduling: { resources: [{ id: "browsers", limit: 6 }], unitsForRequest: () => ({ browsers: 4 }) } });
  const results = await new LocalBuildScheduler(new NodeDriver({ producers: producerRegistry, endpoints }))
    .run(["a", "b"].map((id) => ({ id, state: createGreetingBuild() })));
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
  const scheduler = new LocalBuildScheduler(asyncExecutor(endpoint, operations));
  const [first] = await scheduler.run([{ id: "poll-error", state: createGreetingBuild() }]);
  const [second] = await scheduler.run([{ id: "poll-error", state: first!.state }]);
  const [operation] = await operations.list({ build: "poll-error" });
  assert.equal(second?.status, "failed");
  assert.equal(operation?.status, "failed");
  assert.equal(operation?.receipt?.id, "one");
  assert.match(operation!.failure!.message, /connection lost/);
  await scheduler.run([{ id: "poll-error", state: second!.state }]);
  assert.equal(starts, 1);
  assert.equal(polls, 1);
});
