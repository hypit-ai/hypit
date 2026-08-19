import assert from "node:assert/strict";
import test from "node:test";

import { reduce } from "@hypit/core";
import {
  ProducerRegistry,
  MemoryArtifactStore,
  NodeDriver,
  EndpointRegistry,
} from "@hypit/driver-node";
import { credentialRef } from "@hypit/runtime";

import { capabilities, createGreetingBuild, producers as greetingProducers, types } from "../../core/test/greeting-fixture.js";

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
    if (intent?.value.kind !== "inline") throw new Error("intent must be inline");
    const value = intent.value.value;
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new Error("intent must be an object");
    }
    const name = inlineString((value as Readonly<Record<string, unknown>>).name);
    return {
      outputs: { prompt: { kind: "inline", value: `Greet ${name}` } },
      needs: {},
    };
  });

  producers.registerProducer(greetingProducers.requestText, ({ inputs }) => {
    calls.request += 1;
    const prompt = inputs.prompt;
    assert.equal(prompt?.value.kind, "inline");
    return {
      outputs: {},
      needs: { generation: { prompt: inlineString(prompt.value.value) } },
    };
  });

  producers.registerProducer(greetingProducers.assemble, ({ inputs }) => {
    calls.assemble += 1;
    const generated = inputs.generated;
    assert.equal(generated?.value.kind, "inline");
    return {
      outputs: {
        document: {
          kind: "inline",
          value: { text: inlineString(generated.value.value) },
        },
      },
      needs: {},
    };
  });

  return { producers, endpoints, calls };
}

test("Driver can continue a returned state after its missing Endpoint is installed", async () => {
  const { producers, endpoints, calls } = configuredRegistry();
  const driver = new NodeDriver({ producers, endpoints });
  const paused = await driver.run(createGreetingBuild());

  assert.equal(paused.status, "paused");
  assert.equal(paused.blocked[0]?.reason, "missing-endpoint");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 0 });

  endpoints.registerImmediateEndpoint("example:generation", capabilities.generation, types.generated, ({ need }) => {
    calls.fulfill += 1;
    assert.deepEqual(need.constraints, { prompt: "Greet Ada" });
    return {
      value: { kind: "inline", value: "Hello, Ada!" },
    };
  });

  const completed = await driver.run(paused.state);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 1 });
  assert.equal(completed.state.records.some((record) => record.id === "generated:root"), true);
});

test("Endpoint Registry rejects an ambiguous Runtime Profile", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint("example:alpha", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Alpha" },
  }));
  endpoints.registerImmediateEndpoint("example:beta", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Beta" },
  }));

  const driver = new NodeDriver({ producers, endpoints });
  const ambiguous = await driver.run(createGreetingBuild());
  assert.equal(ambiguous.status, "paused");
  assert.equal(ambiguous.blocked[0]?.reason, "ambiguous-endpoint");
  assert.match(ambiguous.blocked[0]?.subject ?? "", /example:alpha, example:beta/u);

});

test("an Endpoint receives only declared credential slots and secrets never enter BuildState", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint(
    "example:credentialed",
    capabilities.generation,
    types.generated,
    ({ credentials }) => {
      assert.deepEqual(Object.keys(credentials), ["apiKey"]);
      assert.equal(credentials.apiKey?.secret, "top-secret-value");
      return {
        value: { kind: "inline", value: "Credentialed result" },
      };
    },
    { credentials: { apiKey: credentialRef("test", "endpoint-key") } },
  );
  const driver = new NodeDriver({
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
  const completed = await driver.run(createGreetingBuild());
  assert.equal(completed.status, "complete");
  assert.equal(JSON.stringify(completed.state).includes("top-secret-value"), false);
});

test("Endpoint capabilities may narrow themselves with typed Need constraints", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint("example:wrong-model", capabilities.generation, types.generated, () => {
    throw new Error("unsupported endpoint must never run");
  }, { supports: () => false });
  endpoints.registerImmediateEndpoint("example:compatible", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Compatible" },
  }), {
    supports: (need) => {
      const constraints = need.constraints as Readonly<Record<string, unknown>>;
      return constraints.prompt === "Greet Ada";
    },
  });

  const completed = await new NodeDriver({ producers, endpoints }).run(createGreetingBuild());
  assert.equal(completed.status, "complete");
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
      return {
        value: { kind: "inline", value: "must not run" },
      };
    },
  );
  const result = await new NodeDriver({ producers, endpoints }).run(createGreetingBuild());
  assert.equal(result.status, "paused");
  assert.equal(result.blocked[0]?.reason, "missing-endpoint");
  assert.equal(calls, 0);
});

test("an alternate Candidate is explicitly selected before execution, never by Endpoint return Type", async () => {
  const { producers, endpoints } = configuredRegistry();
  producers.registerProducer(
    greetingProducers.placeholderText,
    () => ({
      outputs: { generated: { kind: "inline", value: "Compatible placeholder" } },
      needs: {},
    }),
  );

  const exact = await new NodeDriver({ producers, endpoints }).run(createGreetingBuild());
  assert.equal(exact.status, "paused");
  assert.equal(exact.blocked[0]?.reason, "missing-endpoint");
  const accepted = await new NodeDriver({ producers, endpoints }).run(
    createGreetingBuild({ generationRealization: "placeholder" }),
  );
  assert.equal(accepted.status, "complete");
  assert.equal(accepted.state.needs.length, 0);
});

test("MemoryArtifactStore is content addressed and returns defensive copies", async () => {
  const store = new MemoryArtifactStore();
  const source = new Uint8Array([1, 2, 3]);
  const first = await store.put(source, "application/octet-stream");
  source[0] = 9;
  const second = await store.put(new Uint8Array([1, 2, 3]), "application/octet-stream");
  assert.equal(first.digest, second.digest);
  const loaded = await store.get(first.digest);
  assert.deepEqual(loaded, new Uint8Array([1, 2, 3]));
  if (loaded !== undefined) loaded[0] = 8;
  assert.deepEqual(await store.get(first.digest), new Uint8Array([1, 2, 3]));
});

test("Core still owns scheduling when Driver has every implementation", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint("example:cache", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
  }));
  const start = createGreetingBuild();
  assert.equal(reduce(start).outstanding[0]?.kind, "invoke-producer");
  const result = await new NodeDriver({ producers, endpoints }).run(start);
  assert.equal(result.status, "complete");
});

test("a direct Driver caller can retry one failed Handler without replaying completed producers", async () => {
  const { producers, endpoints, calls } = configuredRegistry();
  let attempts = 0;
  endpoints.registerImmediateEndpoint("example:unstable", capabilities.generation, types.generated, () => {
    calls.fulfill += 1;
    attempts += 1;
    if (attempts === 1) throw new Error("temporary outage");
    return {
      value: { kind: "inline", value: "Hello after retry" },
    };
  });

  const driver = new NodeDriver({ producers, endpoints });
  const paused = await driver.run(createGreetingBuild());
  assert.equal(paused.status, "paused");
  assert.match(paused.outcomes.at(-1)?.message ?? "", /temporary outage/u);
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 1 });

  const completed = await driver.run(paused.state);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 2 });
});
