import assert from "node:assert/strict";
import test from "node:test";

import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerHandlerContext } from "@hypit/producer";
import type { CliRuntimeInspection } from "../../src/runtime-port.js";

import { createGreetingBuild, producers } from "../planning-scenario.js";
import {
  assertPlannedRequests,
  evaluatePlanNeeds,
  plannedEndpointQueries,
  preflightPlan,
  summarizeConstraints,
} from "../../src/build-planning.js";

function greetingDefinition() {
  const state = createGreetingBuild();
  return {
    format: "hypit.build-definition@1" as const,
    program: state.program,
    plan: state.plan,
  };
}

test("Plan retains a deterministic Producer failure even when the Build has no external Need", async () => {
  const state = createGreetingBuild({ targetOutputs: ["prompt"] });
  const definition = {
    format: "hypit.build-definition@1" as const,
    program: state.program,
    plan: state.plan,
  };
  const evaluated = await evaluatePlanNeeds(definition, [{
    format: "hypit.package@1",
    facets: [createProducerPackageFacet([{
        producer: producers.makePrompt,
        handler() {
          throw new Error("Timeline end must be after its start");
        },
      }])],
  }]);

  assert.equal(evaluated.needs.size, 0);
  assert.equal(evaluated.producerFailures.length, 1);
  assert.equal(evaluated.producerFailures[0]?.step, state.plan.steps[0]?.id);
  assert.match(evaluated.producerFailures[0]?.message ?? "", /Timeline end must be after its start/u);
});

test("a structurally planned request stays blocked without creating partial constraints", async () => {
  const definition = greetingDefinition();
  const evaluated = await evaluatePlanNeeds(definition, [{
    format: "hypit.package@1",
    facets: [createProducerPackageFacet([{
        producer: producers.requestText,
        handler: () => ({ kind: "need", constraints: { prompt: "unreachable" } }),
      }])],
  }]);
  const request = [...evaluated.needs.values()][0];

  assert.equal(request?.status, "blocked");
  assert.equal(request?.constraints, undefined);
  assert.deepEqual(request?.pending, [{ input: "prompt", record: "prompt:root", sourceStep: "make-prompt" }]);
  assert.deepEqual(plannedEndpointQueries(evaluated.state, evaluated), [{
    kind: "demand",
    need: "need:generation",
    capability: { module: { name: "example.greeting", version: "0.0.0" }, name: "generate-greeting-text" },
    returns: { module: { name: "example.greeting", version: "0.0.0" }, name: "GeneratedText" },
  }]);
  assert.throws(() => assertPlannedRequests(evaluated.state, evaluated, []), /no selected Endpoint offers/u);
  const endpoints = [{
    need: "need:generation",
    capability: "example.greeting@0.0.0#generate-greeting-text",
    status: "resolved" as const,
    support: "not-evaluated" as const,
    endpoint: "generation.default",
  }];
  assert.doesNotThrow(() => assertPlannedRequests(evaluated.state, evaluated, endpoints));
  let preflighted = false;
  await preflightPlan({
    preflight: async () => {
      preflighted = true;
      return { dataRoot: "/runtime", diagnostics: [] };
    },
  } as Pick<CliRuntimeInspection, "preflight">, evaluated.state);
  assert.equal(preflighted, true);
});

test("an executed request Producer upgrades its structural demand to a concrete Provider query", async () => {
  const definition = greetingDefinition();
  const evaluated = await evaluatePlanNeeds(definition, [{
    format: "hypit.package@1",
    facets: [createProducerPackageFacet([{
        producer: producers.makePrompt,
        handler: () => ({ kind: "output", value: ("Greet Ada") }),
      }, {
        producer: producers.requestText,
        handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "need", constraints: { prompt: inputs.prompt!.value } }),
      }])],
  }]);
  const request = [...evaluated.needs.values()][0];

  assert.equal(request?.status, "concrete");
  assert.deepEqual(request?.constraints, { prompt: "Greet Ada" });
  assert.deepEqual(plannedEndpointQueries(evaluated.state, evaluated), [{
    kind: "concrete",
    need: "need:generation",
    capability: { module: { name: "example.greeting", version: "0.0.0" }, name: "generate-greeting-text" },
    returns: { module: { name: "example.greeting", version: "0.0.0" }, name: "GeneratedText" },
    constraints: { prompt: "Greet Ada" },
  }]);
});

test("a generic request summary preserves scalar paths without recognizing domain value shapes", () => {
  const summary = summarizeConstraints({
    prompt: "A woman writes on a whiteboard in a bright room with a pool behind the glass wall and plants.",
    duration: 10,
    resolution: "720p",
    generateAudio: true,
    referenceImage: { resource: "resource:1", mediaType: "image/png", size: 10 },
    referenceAudio: { resource: "resource:2", mediaType: "audio/wav", size: 10 },
  });
  assert.deepEqual(summary, [
    { at: ["prompt"], value: "A woman writes on a whiteboard in a bri…" },
    { at: ["duration"], value: 10 },
    { at: ["resolution"], value: "720p" },
    { at: ["generateAudio"], value: true },
    { at: ["referenceImage", "resource"], value: "resource:1" },
    { at: ["referenceImage", "mediaType"], value: "image/png" },
    { at: ["referenceImage", "size"], value: 10 },
    { at: ["referenceAudio", "resource"], value: "resource:2" },
    { at: ["referenceAudio", "mediaType"], value: "audio/wav" },
    { at: ["referenceAudio", "size"], value: 10 },
  ]);
});

test("a generic request summary follows nested objects and arrays without unwrapping envelopes", () => {
  const summary = summarizeConstraints({
    fields: {
      prompt: ["A short prompt"],
      resolution: ["2K"],
      referenceImage: [{
        role: "image",
        artifact: { resource: "resource:1", mediaType: "image/png", size: 10 },
      }],
    },
    output: { resolution: "1080p" },
  });
  assert.deepEqual(summary, [
    { at: ["fields", "prompt", 0], value: "A short prompt" },
    { at: ["fields", "resolution", 0], value: "2K" },
    { at: ["fields", "referenceImage", 0, "role"], value: "image" },
    { at: ["fields", "referenceImage", 0, "artifact", "resource"], value: "resource:1" },
    { at: ["fields", "referenceImage", 0, "artifact", "mediaType"], value: "image/png" },
    { at: ["fields", "referenceImage", 0, "artifact", "size"], value: 10 },
    { at: ["output", "resolution"], value: "1080p" },
  ]);
});

test("a request shape is projected the same way regardless of its domain", () => {
  const summary = summarizeConstraints({
    audio: { resource: "resource:3", mediaType: "audio/wav", size: 320_000 },
    sampleFrames: 160_000,
    sampleRate: 16_000,
    language: "en",
  });
  assert.deepEqual(summary, [
    { at: ["audio", "resource"], value: "resource:3" },
    { at: ["audio", "mediaType"], value: "audio/wav" },
    { at: ["audio", "size"], value: 320_000 },
    { at: ["sampleFrames"], value: 160_000 },
    { at: ["sampleRate"], value: 16_000 },
    { at: ["language"], value: "en" },
  ]);
});

test("a request summary preserves root scalars and distinct structural paths", () => {
  assert.deepEqual(summarizeConstraints("direct request"), [{ at: [], value: "direct request" }]);
  assert.deepEqual(summarizeConstraints({ "a.b": 1, a: { b: 2 }, "items[0]": 3, items: [4] }), [
    { at: ["a.b"], value: 1 },
    { at: ["a", "b"], value: 2 },
    { at: ["items[0]"], value: 3 },
    { at: ["items", 0], value: 4 },
  ]);
});

test("long strings are previewed rather than semantically measured", () => {
  const summary = summarizeConstraints({ prompt: "一个女生在大学教室里拿着手麦说话".repeat(3) });
  assert.equal(String(summary[0]?.value).endsWith("…"), true);
  assert.doesNotMatch(String(summary[0]?.value), /words|chars/u);
});
