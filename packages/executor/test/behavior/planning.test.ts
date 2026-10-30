import assert from "node:assert/strict";
import test from "node:test";

// Executor owns Command classification and its observable reasons.

import { evaluateProducerPlan, ProducerRegistry } from "@hypit/executor";
import type { BuildDefinition } from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";

import {
  createGreetingBuild,
  producers,
} from "../execution-scenario.js";
import { createChainDefinition } from "../execution-scenario.js";

function definitionFrom(state: BuildView): BuildDefinition {
  return {
    format: "hypit.build-definition@1",
    program: state.program,
    plan: state.plan,
  };
}

function greetingProducers(): ProducerRegistry {
  const registry = new ProducerRegistry();
  registry.registerProducer(producers.makePrompt, ({ inputs }) => {
    const intent = inputs.intent;
    return { kind: "output", value: ("Greet Ada") };
  });
  registry.registerProducer(producers.requestText, ({ inputs }) => {
    const prompt = inputs.prompt!;
    return { kind: "need", constraints: { prompt: prompt.value } };
  });
  return registry;
}

function stepByProducer(evaluation: Awaited<ReturnType<typeof evaluateProducerPlan>>, name: string) {
  return evaluation.steps.find((step) => step.producer.name === name);
}

test("planning evaluates the pure prefix and traces a downstream Record to its external Need", async () => {
  const evaluation = await evaluateProducerPlan(
    definitionFrom(createGreetingBuild()),
    greetingProducers(),
  );

  assert.equal(stepByProducer(evaluation, producers.makePrompt.name)?.status, "complete");
  assert.equal(stepByProducer(evaluation, producers.requestText.name)?.status, "complete");
  const assemble = stepByProducer(evaluation, producers.assemble.name);
  assert.equal(assemble?.status, "blocked");
  if (assemble?.status !== "blocked") return;
  assert.equal(assemble.dependencies.length, 1);
  assert.equal(assemble.dependencies[0]?.input, "generated");
  assert.equal(assemble.dependencies[0]?.record, "generated:root");
  assert.equal(assemble.dependencies[0]?.type.name, "GeneratedText");
  assert.equal(assemble.dependencies[0]?.source.kind, "need-result");
  assert.equal(assemble.dependencies[0]?.status, "waiting");
  assert.deepEqual(assemble.blockers, [{
    kind: "external-need",
    step: assemble.dependencies[0]?.source.kind === "need-result"
      ? assemble.dependencies[0].source.step
      : "",
    port: "generation",
    need: "need:generation",
    record: "generated:root",
  }]);
  assert.equal(evaluation.records.find((record) => record.record === "generated:root")?.status, "waiting");
  assert.equal(evaluation.steps.filter((step) => step.status === "failed").length, 0);
});

test("planning keeps one Producer failure as the root of every downstream blocked dependency", async () => {
  const registry = new ProducerRegistry();
  registry.registerProducer(producers.makePrompt, () => {
    throw new Error("Timeline end must be after its start");
  });
  const evaluation = await evaluateProducerPlan(definitionFrom(createGreetingBuild()), registry);
  const failed = stepByProducer(evaluation, producers.makePrompt.name);
  const request = stepByProducer(evaluation, producers.requestText.name);
  const assemble = stepByProducer(evaluation, producers.assemble.name);

  assert.equal(failed?.status, "failed");
  assert.equal(request?.status, "blocked");
  assert.equal(assemble?.status, "blocked");
  if (request?.status !== "blocked" || assemble?.status !== "blocked") return;
  assert.equal(request.blockers.length, 1);
  assert.equal(request.blockers[0]?.kind, "producer-failure");
  assert.equal(request.blockers[0]?.step, failed?.step);
  if (request.blockers[0]?.kind === "producer-failure") {
    assert.match(request.blockers[0].message, /Timeline end must be after its start/u);
  }
  assert.deepEqual(assemble.blockers, request.blockers);
  assert.equal(evaluation.steps.filter((step) => step.status === "failed").length, 1);
});

test("an unloaded Producer is unavailable rather than a failed execution", async () => {
  const evaluation = await evaluateProducerPlan(
    definitionFrom(createGreetingBuild()),
    new ProducerRegistry(),
  );
  const unavailable = stepByProducer(evaluation, producers.makePrompt.name);
  const request = stepByProducer(evaluation, producers.requestText.name);

  assert.equal(unavailable?.status, "unavailable");
  assert.equal(request?.status, "blocked");
  if (request?.status !== "blocked") return;
  assert.equal(request.blockers[0]?.kind, "missing-producer");
  assert.equal(request.blockers[0]?.step, unavailable?.step);
  assert.equal(evaluation.steps.filter((step) => step.status === "failed").length, 0);
});

test("a failed branch does not prevent an independent pure Producer from being evaluated", async () => {
  const base = createChainDefinition(1);
  const first = base.plan.steps[0]!;
  const definition: BuildDefinition = {
    ...base,
    plan: {
      ...base.plan,
      steps: [first, {
        ...first,
        id: "step:side",
        result: { kind: "output", name: "next", record: "record:side" },
      }],
      goals: [
        ...base.plan.goals,
        "record:side",
      ],
    },
  };
  const registry = new ProducerRegistry();
  registry.registerProducer(first.producer, ({ command }) => {
    if (command.step === first.id) throw new Error("first branch failed");
    return { kind: "output", value: (1) };
  });

  const evaluation = await evaluateProducerPlan(definition, registry);
  assert.equal(evaluation.steps.find((step) => step.step === first.id)?.status, "failed");
  assert.equal(evaluation.steps.find((step) => step.step === "step:side")?.status, "complete");
  assert.equal(evaluation.records.find((record) => record.record === "record:side")?.status, "available");
});

test("disposable planning applies the same Producer inline Value policy", async () => {
  const registry = new ProducerRegistry();
  registry.registerProducer(producers.makePrompt, () => ({ kind: "output", value: "larger than sixteen bytes" }));
  const evaluation = await evaluateProducerPlan(definitionFrom(createGreetingBuild()), registry, undefined,
    { maxInlineValueBytes: 16 });
  const failed = stepByProducer(evaluation, producers.makePrompt.name);
  assert.equal(failed?.status, "failed");
  if (failed?.status === "failed") assert.match(failed.message, /inline Value bytes; limit is 16 bytes/u);
});
