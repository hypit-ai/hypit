import assert from "node:assert/strict";
import test from "node:test";
import {
  BuildMachine,
  defineBuild,
  materializeBuild,
  plannedNeeds,
} from "@hypit/kernel";
import type {
  CommandResult,
  BuildFact,
  FulfillNeedCommand,
  InvokeProducerCommand,
  Value,
} from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";

import { createGreetingBuild, createParallelGreetingBuild } from "../greeting-fixture.js";

function machineFor(state: BuildView): BuildMachine {
  return new BuildMachine(defineBuild({ program: state.program, plan: state.plan }));
}

function accept(machine: BuildMachine, event: CommandResult): BuildView {
  assert.ok(machine.evaluate(event));
  machine.commit();
  return machine.view();
}

function onlyProducer(machine: BuildMachine): InvokeProducerCommand {
  assert.equal(machine.commands().length, 1);
  const command = machine.commands()[0];
  assert.equal(command?.kind, "invoke-producer");
  return command as InvokeProducerCommand;
}

function producerEvent(
  command: InvokeProducerCommand,
  outputs: Record<string, Value>,
  needs: Record<string, string | { readonly prompt: string }> = {},
): CommandResult {
  const output = Object.values(outputs)[0];
  const need = Object.values(needs)[0];
  assert.ok((output === undefined) !== (need === undefined));
  return {
    kind: "producer-completed",
    command: command.id,
    result: output === undefined
      ? { kind: "need", constraints: need! }
      : { kind: "output", value: output },
  };
}

function reachNeed(initial = createGreetingBuild()): {
  machine: BuildMachine;
  command: FulfillNeedCommand;
} {
  const machine = machineFor(initial);
  accept(
    machine,
    producerEvent(onlyProducer(machine), {
      prompt: ("Greet Ada"),
    }),
  );
  const request = machine.commands().find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(request);
  accept(
    machine,
    producerEvent(request, {}, { generation: { prompt: "Greet Ada" } }),
  );
  const command = machine.commands().find(
    (item): item is FulfillNeedCommand => item.kind === "fulfill-need",
  );
  assert.ok(command);
  return { machine, command };
}

test("Core executes a finite plan through an external Need and completion", () => {
  const current = reachNeed();
  let state = accept(current.machine, {
    kind: "need-fulfilled",
    command: current.command.id,
    value: ("Hello, Ada!"),
  });
  const assemble = state.outstanding.find(
    (command): command is InvokeProducerCommand => command.kind === "invoke-producer",
  );
  assert.ok(assemble);
  state = accept(
    current.machine,
    producerEvent(assemble, {
      document: ({ text: "Hello, Ada!" }),
    }),
  );

  assert.equal(state.status, "complete");
  assert.deepEqual(state.outstanding, []);
  assert.deepEqual(state.records.at(-1)?.value, ({ text: "Hello, Ada!" }));
});

test("Build Definition plus accepted Facts restores the same next Command", () => {
  const initial = createGreetingBuild();
  const definition = defineBuild({
    program: initial.program,
    plan: initial.plan,
  });
  const machine = new BuildMachine(definition);
  const facts: BuildFact[] = [];
  const prompt = machine.commands()[0];
  assert.ok(prompt?.kind === "invoke-producer");
  const promptFact = machine.evaluate(producerEvent(prompt, {
    prompt: ("Greet Ada"),
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
  const materialized = materializeBuild(definition, facts);
  assert.deepEqual(materialized, restored.view());
});

test("scheduling is incremental: a ready Producer runs while an unrelated Need is still outstanding", () => {
  const machine = machineFor(createGreetingBuild({ includeSideTarget: true }));
  let state = accept(machine, producerEvent(onlyProducer(machine), { prompt: ("Greet Ada") }));
  const request = state.outstanding.find((item): item is InvokeProducerCommand =>
    item.kind === "invoke-producer" && item.producer.name === "request-text");
  const side = state.outstanding.find((item): item is InvokeProducerCommand =>
    item.kind === "invoke-producer" && item.producer.name === "placeholder-text");
  assert.ok(request);
  assert.ok(side);
  // The request step emits its Need; the side chain keeps moving without waiting for it.
  state = accept(machine, producerEvent(request, {}, { generation: { prompt: "Greet Ada" } }));
  state = accept(machine, producerEvent(side, { generated: ("Hi, Ada") }));
  assert.ok(state.outstanding.some((item) => item.kind === "fulfill-need"), "the Need is still outstanding");
  const assembleSide = state.outstanding.find((item): item is InvokeProducerCommand =>
    item.kind === "invoke-producer" && item.producer.name === "assemble");
  assert.ok(assembleSide, "the side chain's next Producer was scheduled behind the outstanding Need");
});

test("planned Needs cover the complete finite topology before any Producer executes", () => {
  const state = createParallelGreetingBuild(3);
  assert.equal(state.needs.length, 0);
  assert.deepEqual(plannedNeeds(state).map((need) => ({
    step: need.step,
    need: need.need,
    result: need.result,
  })), [
    { step: "generate-a", need: "need:generation-a", result: "generated:a" },
    { step: "generate-b", need: "need:generation-b", result: "generated:b" },
    { step: "generate-c", need: "need:generation-c", result: "generated:c" },
  ]);
});
