import { blobManifest } from "@hypit/blob";
import { compositionDependency, compositionManifest, compositionTypes } from "@hypit/composition";
import { mediaManifest } from "@hypit/media";
import { narrativeManifest } from "@hypit/narrative";
import {
  narrativeTemporalDependency,
  narrativeTemporalManifest,
  narrativeTemporalTypes,
} from "@hypit/narrative-temporal";
import { spatialManifest, spatialTypes } from "@hypit/spatial";
import { timelineManifest } from "@hypit/timeline";
import { temporalManifest } from "@hypit/temporal";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
  sealGraphFragment,
} from "@hypit/author";
import type {
  FragmentContribution,
  GraphFragment,
} from "@hypit/author";
import type {
  AuthorGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";

const testModule = { name: "example.fragment-speech", version: "0.0.0" } as const;
const requestType = { module: testModule, name: "Request" } satisfies TypeRef;
const generateProducer = { module: testModule, name: "generate" } satisfies ProducerRef;
const projectVisualProducer = { module: testModule, name: "project-visual" } satisfies ProducerRef;
const projectAudioProducer = { module: testModule, name: "project-audio" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: testModule.name,
  version: testModule.version,
  dependencies: [narrativeTemporalDependency, compositionDependency],
  types: [requestType.name],
  capabilities: [],
  producers: [{
    name: generateProducer.name,
    inputs: [
      { name: "request", type: requestType },
      { name: "style", type: requestType },
    ],
    result: { kind: "output" as const, name: "take", type: narrativeTemporalTypes.narrativeAlignment },
  }, {
    name: projectVisualProducer.name,
    inputs: [{ name: "take", type: narrativeTemporalTypes.narrativeAlignment }],
    result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack },
  }, {
    name: projectAudioProducer.name,
    inputs: [{ name: "take", type: narrativeTemporalTypes.narrativeAlignment }],
    result: { kind: "output" as const, name: "audio", type: compositionTypes.audioTrack },
  }],
};

const closure = createResolvedClosure([
  blobManifest,
  mediaManifest,
  narrativeManifest,
  timelineManifest,
  temporalManifest,
  narrativeTemporalManifest,
  spatialManifest,
  compositionManifest,
  manifest,
]);

function program(): LinkedProgram {
  const rawCanvas = {
    id: "canvas:root",
    type: spatialTypes.canvas,
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
      { name: "canvas", type: spatialTypes.canvas },
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
        type: narrativeTemporalTypes.narrativeAlignment,
        root: operation("generate"),
      },
      {
        name: "visual",
        type: compositionTypes.visualTrack,
        root: operation("visual"),
      },
      {
        name: "audio",
        type: compositionTypes.audioTrack,
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
