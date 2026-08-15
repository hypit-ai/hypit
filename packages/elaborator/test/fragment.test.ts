import { videoContractManifests } from "../../../test/support/video-domain.js";
import { speechDependency, speechTypes } from "@narratage/speech";
import { compositionTypes } from "@narratage/composition";
import { spatialTypes } from "@narratage/spatial";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
} from "@narratage/core";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
  sealGraphFragment,
  verifyGraphFragment,
} from "@narratage/elaborator";
import type {
  FragmentContribution,
  GraphFragment,
} from "@narratage/elaborator";
import type {
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";
import {
  speechBasisManifest,
  speechBasisProducers,
} from "@narratage/speech-basis";

const testModule = { name: "example.fragment-speech", version: "0.0.0" } as const;
const requestType = { module: testModule, name: "Request" } satisfies TypeRef;
const generateProducer = { module: testModule, name: "generate" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "narratage.module@1",
  name: testModule.name,
  version: testModule.version,
  dependencies: [speechDependency],
  types: [{ name: requestType.name }],
  capabilities: [],
  producers: [{
    name: generateProducer.name,
    inputs: [
      { name: "request", type: requestType },
      { name: "style", type: requestType },
    ],
    outputs: [{ name: "take", type: speechTypes.basis }],
    needs: [],
  }],
};

const closure = createResolvedClosure([...videoContractManifests, speechBasisManifest, manifest]);

function program(): LinkedProgram {
  const origin = {
    kind: "authored" as const,
  };
  const rawCanvas = sealRecord({
    id: "canvas:root",
    type: spatialTypes.canvas,
    value: { kind: "inline", value: {
      widthPx: 1080, heightPx: 1920,
      origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
    } },
    origin,
  });
  const canvas = rawCanvas;
  return link(closure, [
      sealRecord({
        id: "request:root",
        type: requestType,
        value: { kind: "inline", value: "Say hello." },
        origin,
      }),
      sealRecord({
        id: "style:root",
        type: requestType,
        value: { kind: "inline", value: "Direct to camera." },
        origin,
      }),
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
        result: { kind: "output", name: "take" },
      },
      {
        id: "audio",
        producer: speechBasisProducers.projectAudio,
        inputs: { basis: operation("generate") },
        result: { kind: "output", name: "audio" },
      },
      {
        id: "visual",
        producer: speechBasisProducers.projectVisual,
        inputs: { basis: operation("generate") },
        result: { kind: "output", name: "visual" },
      },
    ],
    exports: [
      {
        name: "take",
        type: speechTypes.basis,
        root: operation("generate"),
      },
      {
        name: "audio",
        type: speechTypes.audioBasis,
        root: operation("audio"),
      },
      {
        name: "visual",
        type: compositionTypes.visualTrack,
        root: operation("visual"),
      },
    ],
  });
}

function instance(programValue: LinkedProgram, id: string) {
  const fragment = speechFragment();
  return elaborateGraphFragment(programValue, fragment, {
    id,
    fragment: fragment.id,
    inputs: {
      request: { kind: "record", id: "request:root" },
      style: { kind: "record", id: "style:root" },
      canvas: { kind: "record", id: "canvas:root" },
    },
  });
}

function graph(programValue: LinkedProgram, ...contributions: readonly FragmentContribution[]): CompiledGraph {
  const merged = mergeFragmentContributions(
    { outputs: [], candidates: [], operations: [] },
    ...contributions,
  );
  return sealCompiledGraph({ program: programValue.semanticDigest, ...merged });
}

test("one FragmentInstance shares its generation Operation across all exports", () => {
  const linked = program();
  const elaborated = instance(linked, "opening");
  const contribution = bindAuthorFragment(elaborated, {
    take: "opening.take",
    audio: "opening.audio",
    visual: "opening.visual",
  });
  const compiled = graph(linked, contribution);
  const request = sealBuildRequest({
    graph: compiled.id,
    targets: [
      { output: "opening.audio" },
      { output: "opening.visual" },
    ],
  });
  const state = start(linked, compiled, request);
  assert.equal(
    state.plan.steps.filter((step) => step.producer.name === generateProducer.name).length,
    1,
  );
  assert.equal(state.plan.steps.length, 3);
  const takeRecord = contribution.operations.find((item) => item.producer.name === "generate")?.result.record;
  assert.equal(
    state.plan.steps.find((step) => step.producer.name === "project-audio")?.inputs.basis,
    takeRecord,
  );
  assert.equal(
    state.plan.steps.find((step) => step.producer.name === "project-visual")?.inputs.basis,
    takeRecord,
  );
});

test("the same Fragment instance is deterministic while distinct instances never content-dedupe", () => {
  const linked = program();
  const opening = instance(linked, "opening");
  const openingAgain = instance(linked, "opening");
  const closing = instance(linked, "closing");
  assert.deepEqual(opening, openingAgain);
  assert.notEqual(opening.id, closing.id);
  assert.equal(
    new Set([...opening.operations, ...closing.operations].map((operation) => operation.id)).size,
    6,
  );

  const compiled = graph(
    linked,
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
  const state = start(linked, compiled, sealBuildRequest({
    graph: compiled.id,
    targets: [
      { output: "opening.audio" },
      { output: "closing.audio" },
    ],
  }));
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
