import assert from "node:assert/strict";
import test from "node:test";
import {
  BuildMachine,
  defineBuild,
  reduce,
} from "@hypit/core";
import type {
  CommandResult,
  BuildFact,
  BuildState,
  FulfillNeedCommand,
  InvokeProducerCommand,
} from "@hypit/protocol";

import { createGreetingBuild } from "./greeting-fixture.js";

function onlyProducer(state: BuildState): { state: BuildState; command: InvokeProducerCommand } {
  const next = reduce(state);
  assert.equal(next.outstanding.length, 1);
  const command = next.outstanding[0];
  assert.equal(command?.kind, "invoke-producer");
  return { state: next, command: command as InvokeProducerCommand };
}

function producerEvent(
  command: InvokeProducerCommand,
  outputs: Record<string, { readonly kind: "inline"; readonly value: string | { readonly text: string } }>,
  needs: Record<string, string | { readonly prompt: string }> = {},
): CommandResult {
  return {
    kind: "producer-completed",
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
    producerEvent(current.command, {
      prompt: { kind: "inline", value: "Greet Ada" },
    }),
  );
  const request = state.outstanding.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(request);
  state = reduce(
    state,
    producerEvent(request, {}, { generation: { prompt: "Greet Ada" } }),
  );
  const command = state.outstanding.find(
    (item): item is FulfillNeedCommand => item.kind === "fulfill-need",
  );
  assert.ok(command);
  return { state, command };
}

test("Core executes a finite plan through an external Need and completion", () => {
  let current = reachNeed();
  let state = reduce(current.state, {
    kind: "need-fulfilled",
    command: current.command.id,
    value: { kind: "inline", value: "Hello, Ada!" },
  });
  const assemble = state.outstanding.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(assemble);
  state = reduce(
    state,
    producerEvent(assemble, {
      document: { kind: "inline", value: { text: "Hello, Ada!" } },
    }),
  );

  assert.equal(state.status, "complete");
  assert.deepEqual(state.outstanding, []);
  assert.deepEqual(state.records.at(-1)?.value, {
    kind: "inline",
    value: { text: "Hello, Ada!" },
  });
});

test("Build Definition plus admitted Facts restores the same next Command", () => {
  const initial = createGreetingBuild();
  const authored = new Set(initial.program.records.map((record) => record.id));
  const definition = defineBuild({
    program: initial.program,
    initialRecords: initial.records.filter((record) => !authored.has(record.id)),
    plan: initial.plan,
    targets: initial.targets,
  });
  const machine = new BuildMachine(definition);
  const facts: BuildFact[] = [];
  const prompt = machine.commands()[0];
  assert.ok(prompt?.kind === "invoke-producer");
  const promptFact = machine.evaluate(producerEvent(prompt, {
    prompt: { kind: "inline", value: "Greet Ada" },
  }));
  assert.ok(promptFact);
  facts.push(promptFact);
  machine.commit();

  const request = machine.commands().find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(request);
  const requestFact = machine.evaluate(
    producerEvent(request, {}, { generation: { prompt: "Greet Ada" } }),
  );
  assert.ok(requestFact);
  facts.push(requestFact);
  machine.commit();

  const restored = new BuildMachine(
    JSON.parse(JSON.stringify(definition)) as typeof definition,
    JSON.parse(JSON.stringify(facts)) as BuildFact[],
  );
  assert.deepEqual(restored.commands(), machine.commands());
  assert.equal(restored.commands()[0]?.kind, "fulfill-need");
});

test("scheduling is incremental: a ready Producer runs while an unrelated Need is still outstanding", () => {
  let current = onlyProducer(createGreetingBuild({ includeSideTarget: true }));
  let state = reduce(current.state, producerEvent(current.command, { prompt: { kind: "inline", value: "Greet Ada" } }));
  const request = state.outstanding.find((item): item is InvokeProducerCommand =>
    item.kind === "invoke-producer" && item.producer.name === "request-text");
  const side = state.outstanding.find((item): item is InvokeProducerCommand =>
    item.kind === "invoke-producer" && item.producer.name === "placeholder-text");
  assert.ok(request);
  assert.ok(side);
  // The request step emits its Need; the side chain keeps moving without waiting for it.
  state = reduce(state, producerEvent(request, {}, { generation: { prompt: "Greet Ada" } }));
  state = reduce(state, producerEvent(side, { generated: { kind: "inline", value: "Hi, Ada" } }));
  assert.ok(state.outstanding.some((item) => item.kind === "fulfill-need"), "the Need is still outstanding");
  const assembleSide = state.outstanding.find((item): item is InvokeProducerCommand =>
    item.kind === "invoke-producer" && item.producer.name === "assemble");
  assert.ok(assembleSide, "the side chain's next Producer was scheduled behind the outstanding Need");
});
