import assert from "node:assert/strict";
import test from "node:test";

import {
  contractTypes,
  videoContractDependencies,
  videoContractManifests,
} from "@narratage/video-contracts";
import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@narratage/core";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
  sameFragmentInstance,
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
  speechTakeManifest,
  speechTakeProducers,
} from "@narratage/speech-take";

const testModule = { name: "example.fragment-speech", version: "0.0.0" } as const;
const requestType = { module: testModule, name: "Request" } satisfies TypeRef;
const generateProducer = { module: testModule, name: "generate" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "svml.module@1",
  name: testModule.name,
  version: testModule.version,
  dependencies: [videoContractDependencies.speech],
  types: [{ name: requestType.name, schema: { kind: "string", minLength: 1 } }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: generateProducer.name,
    inputs: [
      { name: "request", type: requestType },
      { name: "style", type: requestType },
    ],
    outputs: [{ name: "take", type: contractTypes.speechBasis }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.fragment-speech/generate",
      digest: digestOf("example.fragment-speech/generate@1"),
    },
  }],
};

const closure = createResolvedClosure([...videoContractManifests, speechTakeManifest, manifest]);

function program(): LinkedProgram {
  const origin = {
    kind: "authored" as const,
    sourceDigest: digestOf("source:fragment"),
    frontendClosureDigest: digestOf("frontend:fragment"),
  };
  return link(closure, [sealTypedModule({
    id: "author:fragment",
    closureDigest: closure.digest,
    records: [
      sealRecord({
        id: "request:root",
        type: requestType,
        value: { kind: "inline", value: "Say hello." },
        conformance: "exact",
        origin,
      }),
      sealRecord({
        id: "style:root",
        type: requestType,
        value: { kind: "inline", value: "Direct to camera." },
        conformance: "exact",
        origin,
      }),
    ],
  })]);
}

function speechFragment(): GraphFragment {
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
  return sealGraphFragment({
    name: "official-speech-take",
    inputs: [
      { name: "request", type: requestType },
      { name: "style", type: requestType },
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
        producer: speechTakeProducers.projectAudio,
        inputs: { basis: operation("generate") },
        result: { kind: "output", name: "audio" },
      },
      {
        id: "visual",
        producer: speechTakeProducers.projectVisual,
        inputs: { basis: operation("generate") },
        result: { kind: "output", name: "visual" },
      },
    ],
    exports: [
      {
        name: "take",
        type: contractTypes.speechBasis,
        root: operation("generate"),
        semanticInputs: ["request", "style"],
        fidelity: "exact",
      },
      {
        name: "audio",
        type: contractTypes.speechAudioBasis,
        root: operation("audio"),
        semanticInputs: ["request", "style"],
        fidelity: "exact",
      },
      {
        name: "visual",
        type: contractTypes.visualTrack,
        root: operation("visual"),
        semanticInputs: ["request", "style"],
        fidelity: "exact",
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
      { output: "opening.audio", accepts: "exact" },
      { output: "opening.visual", accepts: "exact" },
    ],
    satisfactions: [],
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
  assert.equal(sameFragmentInstance(opening, openingAgain), true);
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
      { output: "opening.audio", accepts: "exact" },
      { output: "closing.audio", accepts: "exact" },
    ],
    satisfactions: [],
  }));
  assert.equal(
    state.plan.steps.filter((step) => step.producer.name === generateProducer.name).length,
    2,
  );
});

test("a Fragment cannot capture an undeclared semantic input", () => {
  const linked = program();
  const valid = speechFragment();
  const invalid = sealGraphFragment({
    name: valid.name,
    inputs: valid.inputs,
    operations: valid.operations,
    exports: valid.exports.map((item) => item.name === "take"
      ? { ...item, semanticInputs: ["request"] }
      : item),
  });
  assert.throws(
    () => verifyGraphFragment(linked, invalid),
    /captures undeclared input style/u,
  );
});

test("Fragment references cannot escape through a raw Graph reference", () => {
  const valid = speechFragment();
  assert.throws(
    () => sealGraphFragment({
      name: valid.name,
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
