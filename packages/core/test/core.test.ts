import assert from "node:assert/strict";
import test from "node:test";

import {
  CoreError,
  canonicalize,
  digestOf,
  reduce,
  validatePlan,
  verifyBuildState,
  verifyRecordAffinity,
} from "@svml/core";
import type {
  BuildEvent,
  BuildPlan,
  BuildState,
  CompiledGraph,
  FulfillNeedCommand,
  InvokeProducerCommand,
  TypedRecord,
} from "@svml/protocol";

import { createGreetingBuild, producers } from "./greeting-fixture.js";

function onlyProducer(state: BuildState): { state: BuildState; command: InvokeProducerCommand } {
  const transition = reduce(state);
  assert.equal(transition.commands.length, 1);
  const command = transition.commands[0];
  assert.equal(command?.kind, "invoke-producer");
  return { state: transition.state, command: command as InvokeProducerCommand };
}

function producerEvent(
  command: InvokeProducerCommand,
  id: string,
  outputs: Record<string, { readonly kind: "inline"; readonly value: string | { readonly text: string } }>,
  needs: Record<string, string | { readonly prompt: string }> = {},
): BuildEvent {
  return {
    kind: "producer-completed",
    id,
    command: command.id,
    outputs,
    needs,
  };
}

function reachNeed(initial = createGreetingBuild()): {
  state: BuildState;
  command: FulfillNeedCommand;
} {
  let current = onlyProducer(initial);
  let transition = reduce(
    current.state,
    producerEvent(current.command, "event:prompt", {
      prompt: { kind: "inline", value: "Greet Ada" },
    }),
  );
  const request = transition.commands.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(request);
  transition = reduce(
    transition.state,
    producerEvent(request, "event:request", {}, { generation: { prompt: "Greet Ada" } }),
  );
  const command = transition.commands.find(
    (item): item is FulfillNeedCommand => item.kind === "fulfill-need",
  );
  assert.ok(command);
  return { state: transition.state, command };
}

test("Core executes its derived finite plan through Need, Receipt and completion", () => {
  let current = reachNeed();
  let transition = reduce(current.state, {
    kind: "need-fulfilled",
    id: "event:fulfill",
    command: current.command.id,
    value: { kind: "inline", value: "Hello, Ada!" },
    requestDigest: current.command.need.requestDigest,
    fulfiller: "test:greeting",
    conformance: "exact",
    delivery: "executed",
    metadata: { model: "fixture" },
  });
  const assemble = transition.commands.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(assemble);
  transition = reduce(
    transition.state,
    producerEvent(assemble, "event:assemble", {
      document: { kind: "inline", value: { text: "Hello, Ada!" } },
    }),
  );

  assert.equal(transition.state.status, "complete");
  assert.equal(transition.commands[0]?.kind, "complete");
  assert.equal(transition.state.derivations.length, 3);
  assert.equal(transition.state.receipts.length, 1);
  assert.equal(transition.state.records.at(-1)?.origin.kind, "derived");
  verifyBuildState(transition.state);
});

test("accepted events are idempotent and conflicting reuse is rejected", () => {
  const initial = onlyProducer(createGreetingBuild());
  const event = producerEvent(initial.command, "event:stable", {
    prompt: { kind: "inline", value: "Greet Ada" },
  });
  const accepted = reduce(initial.state, event);
  const replayed = reduce(accepted.state, event);
  assert.deepEqual(replayed.state, accepted.state);
  assert.deepEqual(replayed.commands, accepted.commands);

  assert.throws(
    () =>
      reduce(
        accepted.state,
        producerEvent(initial.command, "event:stable", {
          prompt: { kind: "inline", value: "Different" },
        }),
      ),
    (error: unknown) => error instanceof CoreError && error.code === "EVENT_ID_REUSED",
  );
});

test("schema-invalid producer output is rejected before it becomes a Record", () => {
  const initial = onlyProducer(createGreetingBuild());
  assert.throws(
    () =>
      reduce(initial.state, {
        kind: "producer-completed",
        id: "event:invalid",
        command: initial.command.id,
        outputs: { prompt: { kind: "inline", value: 42 } },
        needs: {},
      }),
    (error: unknown) => error instanceof CoreError && error.code === "VALUE_SCHEMA_MISMATCH",
  );
});

test("Producer result affinity rejects an exact output that lies about its input", () => {
  const current = reachNeed();
  const fulfilled = reduce(current.state, {
    kind: "need-fulfilled",
    id: "event:affinity-fulfill",
    command: current.command.id,
    value: { kind: "inline", value: "Hello, Ada!" },
    requestDigest: current.command.need.requestDigest,
    fulfiller: "test:greeting",
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  });
  const assemble = fulfilled.commands.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(assemble);
  assert.throws(
    () => reduce(
      fulfilled.state,
      producerEvent(assemble, "event:affinity-lie", {
        document: { kind: "inline", value: { text: "Different text" } },
      }),
    ),
    (error: unknown) => error instanceof CoreError && error.code === "AFFINITY_MISMATCH",
  );
});

test("affinity can prove a first-class BlobRef without a domain wrapper", () => {
  const selected = {
    kind: "blob",
    digest: digestOf("selected-image"),
    size: 3,
    mediaType: "image/png",
  } as const;
  const source = {
    id: "set",
    value: { kind: "inline", value: { images: [selected] } },
  } as unknown as TypedRecord;
  const output = {
    id: "image",
    conformance: "exact",
    value: selected,
  } as unknown as TypedRecord;
  const graph = {
    outputs: [{
      id: "primary-image",
      affinity: [{
        resultPointer: "/digest",
        source: { kind: "record", id: source.id },
        sourcePointer: "/images/0/digest",
      }],
    }],
  } as unknown as CompiledGraph;
  const plan = { selections: [] } as unknown as BuildPlan;

  assert.doesNotThrow(() => verifyRecordAffinity(
    graph,
    plan,
    "primary-image",
    output,
    (id) => id === source.id ? source : undefined,
  ));
  assert.throws(
    () => verifyRecordAffinity(
      graph,
      plan,
      "primary-image",
      { ...output, value: { ...selected, digest: digestOf("different-image") } },
      (id) => id === source.id ? source : undefined,
    ),
    (error: unknown) => error instanceof CoreError && error.code === "AFFINITY_MISMATCH",
  );
});

test("an exact Need rejects a substitute fulfillment", () => {
  const current = reachNeed();
  assert.throws(
    () =>
      reduce(current.state, {
        kind: "need-fulfilled",
        id: "event:substitute",
        command: current.command.id,
        value: { kind: "inline", value: "Placeholder" },
        requestDigest: current.command.need.requestDigest,
        fulfiller: "test:placeholder",
        conformance: "substitute",
        delivery: "provided",
        metadata: {},
      }),
    (error: unknown) => error instanceof CoreError && error.code === "SUBSTITUTE_NOT_ACCEPTED",
  );
});

test("serialized BuildState survives a JSON round trip", () => {
  const current = reachNeed();
  const restored = JSON.parse(JSON.stringify(current.state)) as BuildState;
  verifyBuildState(restored);
  assert.deepEqual(reduce(restored).commands, reduce(current.state).commands);
});

test("a recomputed Need cannot change the capability locked by its Producer port", () => {
  const current = reachNeed();
  const tampered = structuredClone(current.state);
  const need = tampered.needs[0];
  assert.ok(need);
  (need as { capability: unknown }).capability = {
    module: need.capability.module,
    name: "different-operation",
  };
  const requestDigest = digestOf({
    capability: need.capability,
    returns: need.returns,
    constraints: need.constraints,
    result: need.result,
    accepts: need.accepts,
    conformanceFloor: need.conformanceFloor,
  });
  (need as { requestDigest: string }).requestDigest = requestDigest;

  const derivation = tampered.derivations.find((item) => item.id === need.requestedBy);
  assert.ok(derivation);
  (derivation as { needs: unknown }).needs = [{ id: need.id, requestDigest }];
  const { id: _oldId, ...derivationContent } = derivation;
  const nextId = `derivation:${digestOf(derivationContent)}`;
  (derivation as { id: string }).id = nextId;
  (need as { requestedBy: string }).requestedBy = nextId;
  const step = tampered.steps.find((item) => item.derivation === _oldId);
  assert.ok(step);
  (step as { derivation: string }).derivation = nextId;

  assert.throws(
    () => verifyBuildState(tampered),
    (error: unknown) => error instanceof CoreError && error.code === "NEED_PLAN_BINDING_MISMATCH",
  );
});

test("authored values cannot be changed inside a resumed BuildState", () => {
  const tampered = structuredClone(createGreetingBuild()) as BuildState;
  const authored = tampered.records[0];
  assert.ok(authored);
  (authored as { value: unknown }).value = { kind: "inline", value: { name: "Mallory" } };
  assert.throws(
    () => verifyBuildState(tampered),
    (error: unknown) =>
      error instanceof CoreError &&
      ["SEMANTIC_DIGEST_MISMATCH", "RECORD_DIGEST_MISMATCH"].includes(error.code),
  );
});

test("a caller cannot replace Core's graph-derived plan", () => {
  const state = createGreetingBuild();
  const plan = {
    ...state.plan,
    steps: [
      ...state.plan.steps,
      {
        id: "unused",
        producer: producers.makePrompt,
        fidelity: "exact" as const,
        inputs: { intent: "intent:root" },
        outputs: { prompt: "prompt:unused" },
        needs: {},
      },
    ],
  };
  assert.throws(
    () => validatePlan(state.program, state.graph, state.request, plan),
    (error: unknown) => error instanceof CoreError && error.code === "PLAN_NOT_DERIVED",
  );
  const tampered = { ...state, plan };
  assert.throws(() => verifyBuildState(tampered), CoreError);
});

test("canonical values reject accessors and preserve hostile-looking keys as data", () => {
  const source: Record<string, unknown> = {};
  Object.defineProperty(source, "__proto__", {
    value: "data",
    enumerable: true,
  });
  const canonical = canonicalize(source);
  assert.equal(Object.hasOwn(canonical as object, "__proto__"), true);
  assert.equal((canonical as Record<string, unknown>).__proto__, "data");

  const accessor = Object.defineProperty({}, "secret", {
    enumerable: true,
    get: () => "must not execute",
  });
  assert.throws(
    () => canonicalize(accessor),
    (error: unknown) => error instanceof CoreError && error.code === "NON_CANONICAL_ACCESSOR",
  );
});
