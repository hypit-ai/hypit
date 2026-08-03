import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { reduce } from "@svml/core";
import {
  HostRegistry,
  MemoryArtifactStore,
  NodeDriver,
  loadResolvedClosure,
  parseBuildState,
  serializeBuildState,
} from "@svml/driver-node";

import {
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
  calls: GreetingCalls;
} {
  const registry = new HostRegistry();
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

  return { registry, calls };
}

test("Driver pauses at an unbound Need, serializes, then resumes without rerunning producers", async () => {
  const { registry, calls } = configuredRegistry();
  const driver = new NodeDriver({ registry });
  const paused = await driver.run(createGreetingBuild());

  assert.equal(paused.status, "paused");
  assert.equal(paused.blocked[0]?.reason, "missing-handler");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 0 });

  const restored = parseBuildState(serializeBuildState(paused.state));
  registry.registerRequirement(types.generated, ({ need }) => {
    calls.fulfill += 1;
    assert.deepEqual(need.constraints, { prompt: "Greet Ada" });
    return {
      value: { kind: "inline", value: "Hello, Ada!" },
      fulfiller: "example:generation",
      conformance: "exact",
      delivery: "executed",
      metadata: { provider: "fixture" },
    };
  });

  const completed = await driver.run(restored);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 1 });
  assert.equal(completed.state.receipts[0]?.delivery, "executed");
  assert.equal(completed.state.records.find((record) => record.id === "document:root")?.conformance, "exact");
});

test("substitute conformance propagates through later producer outputs", async () => {
  const { registry } = configuredRegistry();
  registry.registerRequirement(types.generated, () => ({
    value: { kind: "inline", value: "Placeholder" },
    fulfiller: "example:placeholder",
    conformance: "substitute",
    delivery: "provided",
    metadata: { reason: "preview" },
  }));
  const result = await new NodeDriver({ registry }).run(
    createGreetingBuild({ needAccepts: "substitute", goalAccepts: "substitute" }),
  );
  assert.equal(result.status, "complete");
  assert.equal(result.state.receipts[0]?.conformance, "substitute");
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
    await writeFile(path, JSON.stringify(manifest), "utf8");
    const closure = await loadResolvedClosure([path]);
    assert.equal(closure.modules.length, 1);
    assert.equal(closure.modules[0]?.manifest.name, "example.greeting");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Core still owns scheduling when Driver has every implementation", async () => {
  const { registry } = configuredRegistry();
  registry.registerRequirement(types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
    fulfiller: "example:cache",
    conformance: "exact",
    delivery: "cache",
    metadata: {},
  }));
  const start = createGreetingBuild();
  assert.equal(reduce(start).commands[0]?.kind, "invoke-producer");
  const result = await new NodeDriver({ registry }).run(start);
  assert.equal(result.status, "complete");
  assert.equal(result.state.receipts[0]?.delivery, "cache");
});

test("receipt metadata is covered by its identity during resume validation", async () => {
  const { registry } = configuredRegistry();
  registry.registerRequirement(types.generated, () => ({
    value: { kind: "inline", value: "Hello, Ada!" },
    fulfiller: "example:cache",
    conformance: "exact",
    delivery: "cache",
    metadata: { cacheKey: "stable" },
  }));
  const result = await new NodeDriver({ registry }).run(createGreetingBuild());
  assert.equal(result.status, "complete");
  const tampered = structuredClone(result.state);
  const receipt = tampered.receipts[0];
  assert.ok(receipt);
  (receipt as { metadata: unknown }).metadata = { cacheKey: "changed" };
  assert.throws(() => parseBuildState(JSON.stringify(tampered)), /content does not match its identity/u);
});

test("a transient Handler failure pauses and can resume without replaying completed producers", async () => {
  const { registry, calls } = configuredRegistry();
  let attempts = 0;
  registry.registerRequirement(types.generated, () => {
    calls.fulfill += 1;
    attempts += 1;
    if (attempts === 1) throw new Error("temporary outage");
    return {
      value: { kind: "inline", value: "Hello after retry" },
      fulfiller: "example:unstable",
      conformance: "exact",
      delivery: "executed",
      metadata: { attempt: attempts },
    };
  });

  const driver = new NodeDriver({ registry });
  const paused = await driver.run(createGreetingBuild());
  assert.equal(paused.status, "paused");
  assert.match(paused.journal.at(-1)?.message ?? "", /temporary outage/u);
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 0, fulfill: 1 });

  const completed = await driver.run(paused.state);
  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { prompt: 1, request: 1, assemble: 1, fulfill: 2 });
});
