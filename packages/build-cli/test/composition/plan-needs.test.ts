import assert from "node:assert/strict";
import test from "node:test";

import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerHandlerContext } from "@hypit/producer";
import type { CliRuntimeInspection } from "@hypit/build-operations-cli";

import { createGreetingBuild, producers } from "../planning-scenario.js";
import {
  assertPlannedRequests,
  describePlanRequest,
  evaluatePlanNeeds,
  plannedEndpointQueries,
  preflightPlan,
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

test("Plan evaluates deterministic Producers under the selected Host inline Value policy", async () => {
  const state = createGreetingBuild({ targetOutputs: ["prompt"] });
  const evaluated = await evaluatePlanNeeds({
    format: "hypit.build-definition@1",
    program: state.program,
    plan: state.plan,
  }, [{
    facets: [createProducerPackageFacet([{
      producer: producers.makePrompt,
      handler: ({ limits }) => {
        assert.equal(limits.maxInlineValueBytes, 16);
        return { kind: "output", value: "a value that is too large" };
      },
    }])],
  }], { maxInlineValueBytes: 16 });

  assert.equal(evaluated.producerFailures.length, 1);
  assert.match(evaluated.producerFailures[0]?.message ?? "", /inline Value bytes; limit is 16 bytes/u);
});

test("a structurally planned request stays blocked without creating partial constraints", async () => {
  const definition = greetingDefinition();
  const evaluated = await evaluatePlanNeeds(definition, [{
    facets: [createProducerPackageFacet([{
        producer: producers.requestText,
        handler: () => ({ kind: "need", constraints: { prompt: "unreachable" } }),
      }])],
  }]);
  const request = [...evaluated.needs.values()][0];

  assert.equal(request?.status, "blocked");
  assert.equal(request?.constraints, undefined);
  assert.deepEqual(request?.pending, ["prompt"]);
  assert.deepEqual(plannedEndpointQueries(evaluated.state, evaluated), [{
    kind: "demand",
    need: "need:generation",
    capability: { module: { name: "example.greeting" }, name: "generate-greeting-text" },
    returns: { module: { name: "example.greeting" }, name: "GeneratedText" },
  }]);
  assert.throws(() => assertPlannedRequests(evaluated.state, evaluated, []), /no selected Endpoint offers/u);
  const endpoints = [{
    need: "need:generation",
    capability: "example.greeting#generate-greeting-text",
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
    capability: { module: { name: "example.greeting" }, name: "generate-greeting-text" },
    returns: { module: { name: "example.greeting" }, name: "GeneratedText" },
    constraints: { prompt: "Greet Ada" },
  }]);
  assert.deepEqual(describePlanRequest("main.svml", 1, evaluated.state, evaluated, []), {
    format: "hypit.cli-plan-request@1",
    source: "main.svml",
    ordinal: 1,
    requestCount: 1,
    returns: "example.greeting#GeneratedText",
    capability: "example.greeting#generate-greeting-text",
    readiness: "concrete",
    pending: [],
    constraints: { prompt: "Greet Ada" },
  });
});
