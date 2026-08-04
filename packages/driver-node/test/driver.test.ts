import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { digestOf, recordDigest, reduce } from "@svml/core";
import {
  HostRegistry,
  MemoryArtifactStore,
  NodeDriver,
  ProviderRegistry,
  loadResolvedClosure,
  parseBuildState,
  serializeBuildState,
} from "@svml/driver-node";

import {
  capabilities,
  createGreetingBuild,
  implementationDigests,
  manifest,
  producers,
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
  registry: HostRegistry;
  providers: ProviderRegistry;
  calls: GreetingCalls;
} {
  const registry = new HostRegistry();
  const providers = new ProviderRegistry();
  const calls = { prompt: 0, request: 0, assemble: 0, fulfill: 0 };

  registry.registerProducer(producers.makePrompt, implementationDigests.makePrompt, ({ inputs }) => {
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

  registry.registerProducer(producers.requestText, implementationDigests.requestText, ({ inputs }) => {
    calls.request += 1;
    const prompt = inputs.prompt;
    assert.equal(prompt?.value.kind, "inline");
    return {
      outputs: {},
      needs: { generation: { prompt: inlineString(prompt.value.value) } },
    };
  });

  registry.registerProducer(producers.assemble, implementationDigests.assemble, ({ inputs }) => {
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

  return { registry, providers, calls };
}

test("Driver pauses at an unbound Need, serializes, then resumes without rerunning producers", async () => {
  const { registry, providers, calls } = configuredRegistry();
  const driver = new NodeDriver({ registry, providers });
  const paused = await driver.run(createGreetingBuild());

  assert.equal(paused.status, "paused");
  assert.equal(paused.blocked[0]?.reason, "missing-provider");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 0 });

  const restored = parseBuildState(serializeBuildState(paused.state));
  providers.registerProvider("example:generation", capabilities.generation, types.generated, ({ need }) => {
    calls.fulfill += 1;
    assert.deepEqual(need.constraints, { prompt: "Greet Ada" });
    return {
      value: { kind: "inline", value: "Hello, Ada!" },
      conformance: "exact",
      delivery: "executed",
      metadata: { provider: "fixture" },
    };
  });

  const completed = await driver.run(restored);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 1 });
  assert.equal(completed.state.receipts[0]?.delivery, "executed");
  assert.equal(completed.state.receipts[0]?.fulfiller, "example:generation");
  assert.equal(completed.state.records.find((record) => record.id === "document:root")?.conformance, "exact");
});

test("Provider Registry rejects ambiguity until the Runtime binds one provider", async () => {
  const { registry, providers } = configuredRegistry();
  providers.registerProvider("example:alpha", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Alpha" },
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  }));
  providers.registerProvider("example:beta", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Beta" },
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  }));

  const driver = new NodeDriver({ registry, providers });
  const ambiguous = await driver.run(createGreetingBuild());
  assert.equal(ambiguous.status, "paused");
  assert.equal(ambiguous.blocked[0]?.reason, "ambiguous-provider");
  assert.match(ambiguous.blocked[0]?.subject ?? "", /example:alpha, example:beta/u);

  providers.bind(capabilities.generation, "example:beta");
  const completed = await driver.run(ambiguous.state);
  assert.equal(completed.status, "complete");
  assert.equal(completed.state.receipts[0]?.fulfiller, "example:beta");
  assert.deepEqual(
    completed.state.records.find((record) => record.id === "document:root")?.value,
    { kind: "inline", value: { text: "Beta" } },
  );
});

test("Provider capabilities may narrow themselves with typed Need constraints", async () => {
  const { registry, providers } = configuredRegistry();
  providers.registerProvider("example:wrong-model", capabilities.generation, types.generated, () => {
    throw new Error("unsupported provider must never run");
  }, { supports: () => false });
  providers.registerProvider("example:compatible", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Compatible" },
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  }), {
    supports: (need) => {
      const constraints = need.constraints as Readonly<Record<string, unknown>>;
      return constraints.prompt === "Greet Ada";
    },
  });

  const completed = await new NodeDriver({ registry, providers }).run(createGreetingBuild());
  assert.equal(completed.status, "complete");
  assert.equal(completed.state.receipts[0]?.fulfiller, "example:compatible");
});

test("the same return Type cannot impersonate another exact capability", async () => {
  const { registry, providers } = configuredRegistry();
  let calls = 0;
  providers.registerProvider(
    "example:wrong-capability",
    { module: capabilities.generation.module, name: "different-text-operation" },
    types.generated,
    () => {
      calls += 1;
      return {
        value: { kind: "inline", value: "must not run" },
        conformance: "exact",
        delivery: "executed",
        metadata: {},
      };
    },
  );
  const result = await new NodeDriver({ registry, providers }).run(createGreetingBuild());
  assert.equal(result.status, "paused");
  assert.equal(result.blocked[0]?.reason, "missing-provider");
  assert.equal(calls, 0);
});

test("a substitute Candidate is explicitly selected by BuildRequest, never by Provider return Type", async () => {
  const { registry, providers } = configuredRegistry();
  registry.registerProducer(
    producers.placeholderText,
    implementationDigests.placeholderText,
    () => ({
      outputs: { generated: { kind: "inline", value: "Compatible placeholder" } },
      needs: {},
    }),
  );

  const exact = await new NodeDriver({ registry, providers }).run(createGreetingBuild());
  assert.equal(exact.status, "paused");
  assert.equal(exact.blocked[0]?.reason, "missing-provider");
  assert.throws(
    () => createGreetingBuild({ generationRealization: "placeholder" }),
    /selects a substitute path/u,
  );

  const accepted = await new NodeDriver({ registry, providers }).run(
    createGreetingBuild({ generationRealization: "placeholder", goalAccepts: "substitute" }),
  );
  assert.equal(accepted.status, "complete");
  assert.equal(accepted.state.receipts.length, 0, "an Alternative Producer is not disguised as a Provider receipt");
  assert.equal(accepted.state.records.find((record) => record.id === "generated:placeholder")?.conformance, "substitute");
});

test("substitute conformance propagates through later producer outputs", async () => {
  const { registry, providers } = configuredRegistry();
  registry.registerProducer(
    producers.placeholderText,
    implementationDigests.placeholderText,
    () => ({ outputs: { generated: { kind: "inline", value: "Placeholder" } }, needs: {} }),
  );
  const result = await new NodeDriver({ registry, providers }).run(
    createGreetingBuild({ generationRealization: "placeholder", goalAccepts: "substitute" }),
  );
  assert.equal(result.status, "complete");
  assert.equal(result.state.records.find((record) => record.id === "generated:placeholder")?.conformance, "substitute");
  assert.equal(result.state.records.find((record) => record.id === "document:root")?.conformance, "substitute");
});

test("Driver refuses a registered implementation whose digest differs from the locked closure", async () => {
  const registry = new HostRegistry();
  registry.registerProducer(producers.makePrompt, implementationDigests.assemble, () => ({
    outputs: { prompt: { kind: "inline", value: "wrong implementation" } },
    needs: {},
  }));
  const result = await new NodeDriver({ registry }).run(createGreetingBuild());
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
  const { registry, providers } = configuredRegistry();
  providers.registerProvider("example:cache", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
    conformance: "exact",
    delivery: "cache",
    metadata: {},
  }));
  const start = createGreetingBuild();
  assert.equal(reduce(start).commands[0]?.kind, "invoke-producer");
  const result = await new NodeDriver({ registry, providers }).run(start);
  assert.equal(result.status, "complete");
  assert.equal(result.state.receipts[0]?.delivery, "cache");
});

test("receipt metadata is covered by its identity during resume validation", async () => {
  const { registry, providers } = configuredRegistry();
  providers.registerProvider("example:cache", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
    conformance: "exact",
    delivery: "cache",
    metadata: { cacheKey: "stable" },
  }));
  const result = await new NodeDriver({ registry, providers }).run(createGreetingBuild());
  assert.equal(result.status, "complete");
  const tampered = structuredClone(result.state);
  const receipt = tampered.receipts[0];
  assert.ok(receipt);
  (receipt as { metadata: unknown }).metadata = { cacheKey: "changed" };
  assert.throws(() => parseBuildState(JSON.stringify(tampered)), /content does not match its identity/u);
});

test("derived output content is bound to the Derivation even if its Record digest is recomputed", async () => {
  const { registry, providers } = configuredRegistry();
  providers.registerProvider("example:cache", capabilities.generation, types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
    conformance: "exact",
    delivery: "cache",
    metadata: {},
  }));
  const result = await new NodeDriver({ registry, providers }).run(createGreetingBuild());
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
  const { registry, providers } = configuredRegistry();
  const driver = new NodeDriver({ registry, providers });
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

  providers.registerProvider("example:generation", capabilities.generation, types.generated, ({ need }) => {
    assert.deepEqual(need.constraints, { prompt: "Greet Ada" });
    return {
      value: { kind: "inline", value: "Hello, Ada!" },
      conformance: "exact",
      delivery: "executed",
      metadata: {},
    };
  });
  const completed = await driver.run(restored);
  assert.equal(completed.status, "complete");
});

test("a transient Handler failure pauses and can resume without replaying completed producers", async () => {
  const { registry, providers, calls } = configuredRegistry();
  let attempts = 0;
  providers.registerProvider("example:unstable", capabilities.generation, types.generated, () => {
    calls.fulfill += 1;
    attempts += 1;
    if (attempts === 1) throw new Error("temporary outage");
    return {
      value: { kind: "inline", value: "Hello after retry" },
      conformance: "exact",
      delivery: "executed",
      metadata: { attempt: attempts },
    };
  });

  const driver = new NodeDriver({ registry, providers });
  const paused = await driver.run(createGreetingBuild());
  assert.equal(paused.status, "paused");
  assert.match(paused.journal.at(-1)?.message ?? "", /temporary outage/u);
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 1 });

  const completed = await driver.run(paused.state);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 2 });
});
