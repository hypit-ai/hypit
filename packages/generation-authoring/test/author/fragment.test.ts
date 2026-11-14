import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/generation-build";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
  sealGraphFragment,
} from "@hypit/generation-authoring/author";
import type {
  FragmentContribution,
  GraphFragment,
} from "@hypit/generation-authoring/author";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";
import type { AuthorGraph, LinkedProgram } from "@hypit/generation-build";

const testModule = { name: "example.fragment-speech" } as const;
const requestType = { module: testModule, name: "Request" } satisfies TypeRef;
const takeType = { module: testModule, name: "Take" } satisfies TypeRef;
const visualType = { module: testModule, name: "Visual" } satisfies TypeRef;
const audioType = { module: testModule, name: "Audio" } satisfies TypeRef;
const canvasType = { module: testModule, name: "Canvas" } satisfies TypeRef;
const generateProducer = { module: testModule, name: "generate" } satisfies ProducerRef;
const projectVisualProducer = { module: testModule, name: "project-visual" } satisfies ProducerRef;
const projectAudioProducer = { module: testModule, name: "project-audio" } satisfies ProducerRef;

const manifest: GenerationModuleDefinition = {
  name: testModule.name,
  dependencies: [],
  types: [requestType.name, takeType.name, visualType.name, audioType.name, canvasType.name],
  capabilities: [],
  producers: [{
    name: generateProducer.name,
    inputs: [
      { name: "request", type: requestType },
      { name: "style", type: requestType },
    ],
    result: { kind: "output" as const, name: "take", type: takeType },
  }, {
    name: projectVisualProducer.name,
    inputs: [{ name: "take", type: takeType }],
    result: { kind: "output" as const, name: "visual", type: visualType },
  }, {
    name: projectAudioProducer.name,
    inputs: [{ name: "take", type: takeType }],
    result: { kind: "output" as const, name: "audio", type: audioType },
  }],
};

const closure = createResolvedClosure([manifest]);

function program(): LinkedProgram {
  const rawCanvas = {
    id: "canvas:root",
    type: canvasType,
    value: ({
      widthPx: 1080, heightPx: 1920,
    }),
  };
  const canvas = rawCanvas;
  return link(closure, [
      {
        id: "request:root",
        type: requestType,
        value: ("Say hello."),
      },
      {
        id: "style:root",
        type: requestType,
        value: ("Direct to camera."),
      },
      canvas,
  ]);
}

function speechFragment(): GraphFragment {
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
  return sealGraphFragment({
    inputs: [
      { name: "request", type: requestType },
      { name: "style", type: requestType },
      { name: "canvas", type: canvasType },
    ],
    operations: [
      {
        id: "generate",
        producer: generateProducer,
        inputs: { request: input("request"), style: input("style") },
        result: { kind: "output" as const, name: "take" },
      },
      {
        id: "visual",
        producer: projectVisualProducer,
        inputs: { take: operation("generate") },
        result: { kind: "output" as const, name: "visual" },
      },
      {
        id: "audio",
        producer: projectAudioProducer,
        inputs: { take: operation("generate") },
        result: { kind: "output" as const, name: "audio" },
      },
    ],
    exports: [
      {
        name: "take",
        type: takeType,
        root: operation("generate"),
      },
      {
        name: "visual",
        type: visualType,
        root: operation("visual"),
      },
      {
        name: "audio",
        type: audioType,
        root: operation("audio"),
      },
    ],
  });
}

function instance(programValue: LinkedProgram, id: string) {
  const fragment = speechFragment();
  return elaborateGraphFragment(programValue, fragment, {
    id,
    inputs: {
      request: { kind: "record", id: "request:root" },
      style: { kind: "record", id: "style:root" },
      canvas: { kind: "record", id: "canvas:root" },
    },
  });
}

function graph(...contributions: readonly FragmentContribution[]): AuthorGraph {
  const merged = mergeFragmentContributions(
    { outputs: [], operations: [] },
    ...contributions,
  );
  return sealAuthorGraph({ ...merged });
}

function buildState(linked: LinkedProgram, authorGraph: AuthorGraph, targets: readonly string[]) {
  const planned = planBuild(linked, authorGraph, targets);
  return materializeBuild(defineBuild({
    program: linked,
    plan: planned.plan,
  }), []);
}

test("one FragmentInstance shares its generation Operation across all exports", () => {
  const linked = program();
  const elaborated = instance(linked, "opening");
  const contribution = bindAuthorFragment(elaborated, {
    take: "opening.take",
    audio: "opening.audio",
    visual: "opening.visual",
  });
  const authorGraph = graph(contribution);
  const state = buildState(linked, authorGraph, ["opening.audio", "opening.visual"]);
  assert.equal(
    state.plan.steps.filter((step) => step.producer.name === generateProducer.name).length,
    1,
  );
  assert.equal(state.plan.steps.length, 3);
  const takeRecord = contribution.operations.find((item) => item.producer.name === "generate")?.result.record;
  assert.equal(
    state.plan.steps.find((step) => step.producer.name === "project-audio")?.inputs.take,
    takeRecord,
  );
  assert.equal(
    state.plan.steps.find((step) => step.producer.name === "project-visual")?.inputs.take,
    takeRecord,
  );
});

test("distinct Fragment instances retain independent Operation identities", () => {
  const linked = program();
  const opening = instance(linked, "opening");
  const closing = instance(linked, "closing");
  assert.notEqual(opening.id, closing.id);
  assert.equal(
    new Set([...opening.operations, ...closing.operations].map((operation) => operation.id)).size,
    6,
  );

  const authorGraph = graph(
    bindAuthorFragment(opening, {
      take: "opening.take",
      audio: "opening.audio",
      visual: "opening.visual",
    }),
    bindAuthorFragment(closing, {
      take: "closing.take",
      audio: "closing.audio",
      visual: "closing.visual",
    }),
  );
  const state = buildState(linked, authorGraph, ["opening.audio", "closing.audio"]);
  assert.equal(
    state.plan.steps.filter((step) => step.producer.name === generateProducer.name).length,
    2,
  );
});

test("Fragment references cannot escape through a raw Graph reference", () => {
  const valid = speechFragment();
  assert.throws(
    () => sealGraphFragment({
      inputs: valid.inputs,
      operations: valid.operations.map((item) => item.id === "generate"
        ? {
            ...item,
            inputs: {
              ...item.inputs,
              request: { kind: "record", id: "secret:ambient" } as never,
            },
          }
        : item),
      exports: valid.exports,
    }),
    /must name a declared input or local Operation/u,
  );
});
