import assert from "node:assert/strict";
import test from "node:test";

import { BuildMachine } from "@hypit/kernel";
import type { BuildFact, InvokeProducerCommand } from "@hypit/protocol";

import { completeChainStep, createChainDefinition } from "../chain-fixture.js";

test("BuildMachine advances a long chain through only its newly ready command and restores from Facts", () => {
  const definition = createChainDefinition(512);
  const machine = new BuildMachine(definition);
  const facts: BuildFact[] = [];
  for (let index = 0; index < 512; index += 1) {
    assert.equal(machine.commands().length, 1);
    const command = machine.commands()[0];
    assert.equal(command?.kind, "invoke-producer");
    assert.equal(command.step, `step:${index}`);
    const fact = machine.evaluate(completeChainStep(command as InvokeProducerCommand));
    assert.ok(fact);
    facts.push(fact);
    machine.commit();
  }
  assert.equal(machine.status, "complete");
  assert.equal(machine.commands().length, 0);
  assert.deepEqual(machine.record("record:512")?.value, (512));

  const restored = new BuildMachine(definition, facts);
  assert.equal(restored.status, "complete");
  assert.deepEqual(restored.view(), machine.view());
});
