import assert from "node:assert/strict";
import test from "node:test";

// This suite verifies Executor handoff to Producer and Endpoint implementations.

import {
  ProducerRegistry,
  MemoryResourceStore,
  Executor,
  EndpointRegistry,
} from "@hypit/executor";
import { credentialRef, InProcessBuildScheduler } from "@hypit/runtime";
import type { ScheduledBuildResult, WritableCredentialStore } from "@hypit/runtime";
import type { BuildView } from "@hypit/kernel";

import { capabilities, createGreetingBuild, producers as greetingProducers, types } from "../execution-scenario.js";

async function runBuild(executor: Executor, input: BuildView | ScheduledBuildResult) {
  const request = "facts" in input
    ? { id: "driver-test", definition: input.definition, facts: input.facts }
    : { id: "driver-test", definition: {
        format: "hypit.build-definition@1" as const,
        program: input.program,
        plan: input.plan,
      }, facts: [] };
  return (await new InProcessBuildScheduler(executor).run([request]))[0]!;
}

function inlineString(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected inline string");
  return value;
}

type GreetingCalls = {
  prompt: number;
  request: number;
  assemble: number;
  fulfill: number;
};

function configuredRegistry(): {
  producers: ProducerRegistry;
  endpoints: EndpointRegistry;
  calls: GreetingCalls;
} {
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  const calls = { prompt: 0, request: 0, assemble: 0, fulfill: 0 };

  producers.registerProducer(greetingProducers.makePrompt, ({ inputs }) => {
    calls.prompt += 1;
    const intent = inputs.intent;
    if (intent === undefined) throw new Error("intent is missing");
    const value = intent.value;
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new Error("intent must be an object");
    }
    const name = inlineString((value as Readonly<Record<string, unknown>>).name);
    return { kind: "output", value: (`Greet ${name}`) };
  });

  producers.registerProducer(greetingProducers.requestText, ({ inputs }) => {
    calls.request += 1;
    const prompt = inputs.prompt!;
    return { kind: "need", constraints: { prompt: inlineString(prompt.value) } };
  });

  producers.registerProducer(greetingProducers.assemble, ({ inputs }) => {
    calls.assemble += 1;
    const generated = inputs.generated!;
    return { kind: "output", value: ({ text: inlineString(generated.value) }) };
  });

  return { producers, endpoints, calls };
}

test("the Scheduler can continue a returned state after its missing Endpoint is installed", async () => {
  const { producers, endpoints, calls } = configuredRegistry();
  const driver = new Executor({ producers, endpoints });
  const paused = await runBuild(driver, createGreetingBuild());

  assert.equal(paused.status, "paused");
  assert.equal(paused.blocked[0]?.reason, "missing-endpoint");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 0 });

  endpoints.registerImmediateEndpoint("example:generation", capabilities.generation, types.generated, ({ request }) => {
    calls.fulfill += 1;
    assert.deepEqual(request.constraints, { prompt: "Greet Ada" });
    return "Hello, Ada!";
  });

  const completed = await runBuild(driver, paused);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 1 });
  assert.equal(completed.state.records.some((record) => record.id === "generated:root"), true);
});

test("Endpoint Registry rejects an ambiguous Runtime Profile", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint("example:alpha", capabilities.generation, types.generated, () => "Alpha");
  endpoints.registerImmediateEndpoint("example:beta", capabilities.generation, types.generated, () => "Beta");

  const driver = new Executor({ producers, endpoints });
  const ambiguous = await runBuild(driver, createGreetingBuild());
  assert.equal(ambiguous.status, "paused");
  assert.equal(ambiguous.blocked[0]?.reason, "ambiguous-endpoint");
  assert.match(ambiguous.blocked[0]?.subject ?? "", /example:alpha, example:beta/u);

});

test("an Endpoint receives only declared credential slots and secrets never enter BuildView", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint(
    "example:credentialed",
    capabilities.generation,
    types.generated,
    ({ credentials }) => {
      assert.deepEqual(Object.keys(credentials), ["apiKey"]);
      assert.equal(credentials.apiKey?.secret, "top-secret-value");
      return "Credentialed result";
    },
    { credentials: { apiKey: credentialRef("test", "endpoint-key") } },
  );
  const driver = new Executor({
    producers,
    endpoints,
    credentials: {
      async resolve(ref) {
        return ref.store === "test" && ref.key === "endpoint-key"
          ? { secret: "top-secret-value" }
          : undefined;
      },
    },
  });
  const completed = await runBuild(driver, createGreetingBuild());
  assert.equal(completed.status, "complete");
  assert.equal(JSON.stringify(completed.state).includes("top-secret-value"), false);
});

test("an Endpoint receives prototype-looking credential slots as ordinary data", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint(
    "example:prototype-credential",
    capabilities.generation,
    types.generated,
    ({ credentials }) => {
      assert.equal(Object.hasOwn(credentials, "__proto__"), true);
      assert.equal(credentials.__proto__?.secret, "top-secret-value");
      return "Credentialed result";
    },
    { credentials: Object.fromEntries([["__proto__", credentialRef("test", "endpoint-key")]]) },
  );
  const completed = await runBuild(new Executor({
    producers,
    endpoints,
    credentials: { resolve: async () => ({ secret: "top-secret-value" }) },
  }), createGreetingBuild());
  assert.equal(completed.status, "complete");
});

test("a writable credential gives its Endpoint authority to replace only that declared slot", async () => {
  const { producers, endpoints } = configuredRegistry();
  let stored = "old-secret";
  endpoints.registerImmediateEndpoint(
    "example:credential-rotation",
    capabilities.generation,
    types.generated,
    async ({ credentials }) => {
      assert.equal(typeof credentials.apiKey?.replace, "function");
      await credentials.apiKey!.replace!({ secret: "new-secret" });
      assert.equal("credentialStore" in credentials.apiKey!, false);
      return "Credentialed result";
    },
    { credentials: { apiKey: credentialRef("test", "endpoint-key") } },
  );
  const credentialStore: WritableCredentialStore = {
    owns(ref) { return ref.store === "test"; },
    async resolve() { return { secret: stored }; },
    async put(_ref, value) { stored = value.secret; },
    async delete() { return false; },
  };
  const driver = new Executor({
    producers,
    endpoints,
    credentials: credentialStore,
  });
  const completed = await runBuild(driver, createGreetingBuild());
  assert.equal(completed.status, "complete");
  assert.equal(stored, "new-secret");
});

test("request support checks only the deployment selected by an explicit binding", async () => {
  const { producers, endpoints } = configuredRegistry();
  let wrongSupportCalls = 0;
  endpoints.registerImmediateEndpoint("example:wrong-model", capabilities.generation, types.generated, () => {
    throw new Error("unsupported endpoint must never run");
  }, { supports: () => {
    wrongSupportCalls += 1;
    return { status: "unsupported", reason: "example request is unsupported" };
  } });
  endpoints.registerImmediateEndpoint("example:compatible", capabilities.generation, types.generated, () => "Compatible", {
    supports: (need) => {
      const constraints = need.constraints as Readonly<Record<string, unknown>>;
      return constraints.prompt === "Greet Ada"
        ? { status: "supported" }
        : { status: "unsupported", reason: "prompt must be Greet Ada" };
    },
  });

  const ambiguous = await runBuild(new Executor({ producers, endpoints }), createGreetingBuild());
  assert.equal(ambiguous.status, "paused");
  assert.equal(ambiguous.blocked[0]?.reason, "ambiguous-endpoint");
  assert.equal(wrongSupportCalls, 0);

  endpoints.bind(capabilities.generation, "example:compatible");
  const completed = await runBuild(new Executor({ producers, endpoints }), ambiguous);
  assert.equal(completed.status, "complete");
  assert.equal(wrongSupportCalls, 0);
  assert.equal(completed.state.records.some((record) => record.id === "generated:root"), true);
});

test("the same return Type cannot impersonate another exact capability", async () => {
  const { producers, endpoints } = configuredRegistry();
  let calls = 0;
  endpoints.registerImmediateEndpoint(
    "example:wrong-capability",
    { module: capabilities.generation.module, name: "different-text-operation" },
    types.generated,
    () => {
      calls += 1;
      return "must not run";
    },
  );
  const result = await runBuild(new Executor({ producers, endpoints }), createGreetingBuild());
  assert.equal(result.status, "paused");
  assert.equal(result.blocked[0]?.reason, "missing-endpoint");
  assert.equal(calls, 0);
});

test("the finite BuildDefinition fixes the producer path before execution, never by Endpoint return Type", async () => {
  const { producers, endpoints } = configuredRegistry();
  producers.registerProducer(
    greetingProducers.placeholderText,
    () => ({ kind: "output", value: ("Compatible placeholder") }),
  );

  const exact = await runBuild(new Executor({ producers, endpoints }), createGreetingBuild());
  assert.equal(exact.status, "paused");
  assert.equal(exact.blocked[0]?.reason, "missing-endpoint");
  const accepted = await runBuild(new Executor({ producers, endpoints }),
    createGreetingBuild({ generationStep: "placeholder" }));
  assert.equal(accepted.status, "complete");
  assert.equal(accepted.state.needs.length, 0);
});

test("MemoryResourceStore keeps independent admissions and returns defensive copies", async () => {
  const store = new MemoryResourceStore();
  const source = new Uint8Array([1, 2, 3]);
  const first = await store.put(source, "application/octet-stream");
  source[0] = 9;
  const second = await store.put(new Uint8Array([1, 2, 3]), "application/octet-stream");
  assert.notEqual(first.resource, second.resource);
  const loaded = await store.get(first.resource);
  assert.deepEqual(loaded, new Uint8Array([1, 2, 3]));
  if (loaded !== undefined) loaded[0] = 8;
  assert.deepEqual(await store.get(first.resource), new Uint8Array([1, 2, 3]));
});

test("Core still owns command readiness when Executor has every implementation", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint("example:cache", capabilities.generation, types.generated, () => "Hello, Ada!");
  const start = createGreetingBuild();
  assert.equal(start.outstanding[0]?.kind, "invoke-producer");
  const result = await runBuild(new Executor({ producers, endpoints }), start);
  assert.equal(result.status, "complete");
});

test("a Scheduler-owned execution failure ends its state and a new attempt starts independently", async () => {
  const { producers, endpoints, calls } = configuredRegistry();
  let attempts = 0;
  endpoints.registerImmediateEndpoint("example:unstable", capabilities.generation, types.generated, () => {
    calls.fulfill += 1;
    attempts += 1;
    if (attempts === 1) throw new Error("temporary outage");
    return "Hello after retry";
  });

  const driver = new Executor({ producers, endpoints });
  const paused = await runBuild(driver, createGreetingBuild());
  assert.equal(paused.status, "failed");
  assert.match(paused.outcomes.at(-1)?.message ?? "", /temporary outage/u);
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 1 });

  assert.equal((await runBuild(driver, paused)).status, "failed");
  assert.equal(calls.fulfill, 1);
  const completed = await runBuild(driver, createGreetingBuild());
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 2, request: 2, assemble: 1, fulfill: 2 });
});

test("shared action-rate declarations conflict when their periods differ", () => {
  const registry = new EndpointRegistry();
  for (const [id, periodMs] of [["a", 100], ["b", 200]] as const) {
    registry.registerAsyncEndpoint(id, capabilities.generation, types.generated, {
      start: () => ({ status: "pending", handle: { id } }),
      poll: () => ({ status: "completed", result: "done" }),
    }, { scheduling: { resources: [{ id: "pool:shared", limit: 10 }],
      actions: { submit: [{ id: "rate:shared/submit", limit: 1, periodMs }] } } });
  }
  const [conflict] = registry.capacityConflicts();
  assert.equal(conflict?.resource, "rate:shared/submit");
  assert.deepEqual(conflict?.endpointIds, ["a", "b"]);
  assert.deepEqual(conflict?.settings, ["1 per 100 ms", "1 per 200 ms"]);
});
