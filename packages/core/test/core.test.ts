import assert from "node:assert/strict";
import test from "node:test";

import {
  CoreError,
  canonicalize,
  digestOf,
  reduce,
  validateStoredValue,
  validatePlan,
  verifyBuildState,
} from "@narratage/core";
import type {
  BuildEvent,
  BuildState,
  FulfillNeedCommand,
  InvokeProducerCommand,
  ValueSchema,
} from "@narratage/protocol";

import { createGreetingBuild, producers } from "./greeting-fixture.js";

function onlyProducer(state: BuildState): { state: BuildState; command: InvokeProducerCommand } {
  const next = reduce(state);
  assert.equal(next.outstanding.length, 1);
  const command = next.outstanding[0];
  assert.equal(command?.kind, "invoke-producer");
  return { state: next, command: command as InvokeProducerCommand };
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
  let state = reduce(
    current.state,
    producerEvent(current.command, "event:prompt", {
      prompt: { kind: "inline", value: "Greet Ada" },
    }),
  );
  const request = state.outstanding.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(request);
  state = reduce(
    state,
    producerEvent(request, "event:request", {}, { generation: { prompt: "Greet Ada" } }),
  );
  const command = state.outstanding.find(
    (item): item is FulfillNeedCommand => item.kind === "fulfill-need",
  );
  assert.ok(command);
  return { state, command };
}

test("Core executes its derived finite plan through Need, Receipt and completion", () => {
  let current = reachNeed();
  let state = reduce(current.state, {
    kind: "need-fulfilled",
    id: "event:fulfill",
    command: current.command.id,
    value: { kind: "inline", value: "Hello, Ada!" },
    requestDigest: current.command.need.requestDigest,
    fulfiller: "test:greeting",
  });
  const assemble = state.outstanding.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(assemble);
  state = reduce(
    state,
    producerEvent(assemble, "event:assemble", {
      document: { kind: "inline", value: { text: "Hello, Ada!" } },
    }),
  );

  assert.equal(state.status, "complete");
  assert.deepEqual(state.outstanding, []);
  assert.equal(state.derivations.length, 3);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.records.at(-1)?.origin.kind, "derived");
  verifyBuildState(state);
});

test("accepted events are idempotent and conflicting reuse is rejected", () => {
  const initial = onlyProducer(createGreetingBuild());
  const event = producerEvent(initial.command, "event:stable", {
    prompt: { kind: "inline", value: "Greet Ada" },
  });
  const accepted = reduce(initial.state, event);
  const replayed = reduce(accepted, event);
  assert.deepEqual(replayed, accepted);

  assert.throws(
    () =>
      reduce(
        accepted,
        producerEvent(initial.command, "event:stable", {
          prompt: { kind: "inline", value: "Different" },
        }),
      ),
    (error: unknown) => error instanceof CoreError && error.code === "EVENT_ID_REUSED",
  );
});

test("oneOf literal discrimination preserves exact-one semantics", () => {
  const tagged = (tag: string): ValueSchema => ({
    kind: "object",
    fields: {
      kind: { schema: { kind: "literal", value: tag } },
      payload: { schema: { kind: "string" } },
    },
  });
  const generic: ValueSchema = {
    kind: "object",
    fields: {
      kind: { schema: { kind: "string" } },
      payload: { schema: { kind: "string" } },
    },
  };

  assert.doesNotThrow(() => validateStoredValue(
    { kind: "inline", value: { kind: "alpha", payload: "hello" } },
    { kind: "oneOf", variants: [tagged("alpha"), tagged("beta")] },
  ));
  assert.throws(
    () => validateStoredValue(
      { kind: "inline", value: { kind: "alpha", payload: "hello" } },
      { kind: "oneOf", variants: [tagged("alpha"), generic] },
    ),
    (error: unknown) => error instanceof CoreError && error.code === "VALUE_SCHEMA_MISMATCH",
  );
});

test("serialized BuildState survives a JSON round trip", () => {
  const current = reachNeed();
  const restored = JSON.parse(JSON.stringify(current.state)) as BuildState;
  verifyBuildState(restored);
  assert.deepEqual(reduce(restored).outstanding, reduce(current.state).outstanding);
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
