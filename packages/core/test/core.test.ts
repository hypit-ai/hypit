import assert from "node:assert/strict";
import test from "node:test";

import {
  CoreError,
  canonicalize,
  reduce,
  start,
  validatePlan,
  verifyBuildState,
} from "@svml/core";
import type {
  BuildEvent,
  BuildState,
  FulfillNeedCommand,
  InvokeProducerCommand,
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

test("Core executes an explicit finite plan through Need, Receipt and completion", () => {
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

test("an explicit plan cannot hide producer steps unrelated to its goals", () => {
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
    () => validatePlan(state.program, plan),
    (error: unknown) => error instanceof CoreError && error.code === "UNREACHABLE_STEP",
  );
  assert.throws(() => start(state.program, plan), CoreError);
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
