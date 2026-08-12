import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { digestOf, recordDigest, reduce } from "@narratage/core";
import {
  ProducerRegistry,
  MemoryArtifactStore,
  NodeDriver,
  EndpointRegistry,
  loadResolvedClosure,
  parseBuildState,
  serializeBuildState,
} from "@narratage/driver-node";
import { credentialRef } from "@narratage/runtime";

import {
  capabilities,
  createGreetingBuild,
  implementationDigests,
  manifest,
  producers as greetingProducers,
  types,
} from "../../core/test/greeting-fixture.js";

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

  producers.registerProducer(greetingProducers.makePrompt, implementationDigests.makePrompt, ({ inputs }) => {
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

  producers.registerProducer(greetingProducers.requestText, implementationDigests.requestText, ({ inputs }) => {
    calls.request += 1;
    const prompt = inputs.prompt;
    assert.equal(prompt?.value.kind, "inline");
    return {
      outputs: {},
      needs: { generation: { prompt: inlineString(prompt.value.value) } },
    };
  });

  producers.registerProducer(greetingProducers.assemble, implementationDigests.assemble, ({ inputs }) => {
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

test("Driver pauses at an unbound Need, serializes, then resumes without rerunning producers", async () => {
  const { producers, endpoints, calls } = configuredRegistry();
  const driver = new NodeDriver({ producers, endpoints });
  const paused = await driver.run(createGreetingBuild());

  assert.equal(paused.status, "paused");
  assert.equal(paused.blocked[0]?.reason, "missing-endpoint");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 0 });

  const restored = parseBuildState(serializeBuildState(paused.state));
  const endpointImplementation = {
    facet: {
      module: { name: "example/runtime", version: "1" },
      name: "generation",
    },
    digest: digestOf("example:generation-implementation"),
    configurationDigest: digestOf({ model: "fixture" }),
  } as const;
  endpoints.registerImmediateEndpoint("example:generation", capabilities.generation, types.generated, ({ need }) => {
    calls.fulfill += 1;
    assert.deepEqual(need.constraints, { prompt: "Greet Ada" });
    return {
      value: { kind: "inline", value: "Hello, Ada!" },
      metadata: { endpoint: "fixture" },
    };
  }, { runtimeImplementation: endpointImplementation });

  const completed = await driver.run(restored);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 1 });
  assert.equal(completed.state.receipts[0]?.fulfiller, "example:generation");
  assert.deepEqual(completed.state.receipts[0]?.implementation, {
    digest: endpointImplementation.digest,
    configurationDigest: endpointImplementation.configurationDigest,
  });
});

test("Endpoint Registry rejects ambiguity until the Runtime binds one endpoint", async () => {
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

  endpoints.bind(capabilities.generation, "example:beta");
  const completed = await driver.run(ambiguous.state);
  assert.equal(completed.status, "complete");
  assert.equal(completed.state.receipts[0]?.fulfiller, "example:beta");
  assert.deepEqual(
    completed.state.records.find((record) => record.id === "document:root")?.value,
    { kind: "inline", value: { text: "Beta" } },
  );
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
        metadata: { authenticated: true },
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
  assert.equal(completed.state.receipts[0]?.fulfiller, "example:compatible");
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
    implementationDigests.placeholderText,
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
  assert.equal(accepted.state.receipts.length, 0, "an Alternative Producer is not disguised as an Endpoint receipt");
});

test("Driver refuses a registered implementation whose digest differs from the locked closure", async () => {
  const producers = new ProducerRegistry();
  producers.registerProducer(greetingProducers.makePrompt, implementationDigests.assemble, () => ({
    outputs: { prompt: { kind: "inline", value: "wrong implementation" } },
    needs: {},
  }));
  const result = await new NodeDriver({ producers }).run(createGreetingBuild());
  assert.equal(result.status, "paused");
  assert.equal(result.blocked[0]?.reason, "implementation-mismatch");
  assert.equal(result.state.records.length, 1);
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

test("Driver reads static manifests without executing package code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-driver-"));
  const path = join(directory, "svml.module.json");
  try {
    const withSurface = {
      ...manifest,
      surfaces: [
        {
          name: "greeting",
          tag: "greeting",
          mode: "structured" as const,
          outputs: [types.intent],
          implementation: {
            kind: "trusted-frontend-surface",
            locator: "example.greeting/surface",
            digest: digestOf("example.greeting/surface@0"),
          },
        },
      ],
    };
    await writeFile(path, JSON.stringify(withSurface), "utf8");
    const closure = await loadResolvedClosure([path]);
    assert.equal(closure.modules.length, 1);
    assert.equal(closure.modules[0]?.manifest.name, "example.greeting");
    assert.equal(closure.modules[0]?.manifest.surfaces[0]?.mode, "structured");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Core still owns scheduling when Driver has every implementation", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint("example:cache", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
  }));
  const start = createGreetingBuild();
  assert.equal(reduce(start).commands[0]?.kind, "invoke-producer");
  const result = await new NodeDriver({ producers, endpoints }).run(start);
  assert.equal(result.status, "complete");
});

test("derived output content is bound to the Derivation even if its Record digest is recomputed", async () => {
  const { producers, endpoints } = configuredRegistry();
  endpoints.registerImmediateEndpoint("example:cache", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
  }));
  const result = await new NodeDriver({ producers, endpoints }).run(createGreetingBuild());
  assert.equal(result.status, "complete");
  const tampered = structuredClone(result.state);
  const document = tampered.records.find((record) => record.id === "document:root");
  assert.ok(document);
  (document as { value: unknown }).value = { kind: "inline", value: { text: "tampered" } };
  (document as { digest: string }).digest = recordDigest(document.type, document.value);
  assert.throws(
    () => parseBuildState(JSON.stringify(tampered)),
    /is not an output|digest differs|does not match/u,
  );
});

test("resume discards serialized Commands and regenerates the exact request before any Handler runs", async () => {
  const { producers, endpoints } = configuredRegistry();
  const driver = new NodeDriver({ producers, endpoints });
  const paused = await driver.run(createGreetingBuild());
  assert.equal(paused.status, "paused");
  const serialized = JSON.parse(serializeBuildState(paused.state)) as Record<string, unknown>;
  const original = paused.state.outstanding.find((command) => command.kind === "fulfill-need");
  assert.ok(original && original.kind === "fulfill-need");
  serialized.outstanding = [{
    ...original,
    need: { ...original.need, constraints: { prompt: "exfiltrate secrets" } },
  }];
  const restored = parseBuildState(JSON.stringify(serialized));
  assert.deepEqual(restored.outstanding, []);

  endpoints.registerImmediateEndpoint("example:generation", capabilities.generation, types.generated, ({ need }) => {
    assert.deepEqual(need.constraints, { prompt: "Greet Ada" });
    return {
      value: { kind: "inline", value: "Hello, Ada!" },
    };
  });
  const completed = await driver.run(restored);
  assert.equal(completed.status, "complete");
});

test("a transient Handler failure pauses and can resume without replaying completed producers", async () => {
  const { producers, endpoints, calls } = configuredRegistry();
  let attempts = 0;
  endpoints.registerImmediateEndpoint("example:unstable", capabilities.generation, types.generated, () => {
    calls.fulfill += 1;
    attempts += 1;
    if (attempts === 1) throw new Error("temporary outage");
    return {
      value: { kind: "inline", value: "Hello after retry" },
      metadata: { attempt: attempts },
    };
  });

  const driver = new NodeDriver({ producers, endpoints });
  const paused = await driver.run(createGreetingBuild());
  assert.equal(paused.status, "paused");
  assert.match(paused.journal.at(-1)?.message ?? "", /temporary outage/u);
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 1 });

  const completed = await driver.run(paused.state);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 2 });
});
