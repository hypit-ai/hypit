import assert from "node:assert/strict";
import test from "node:test";

import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@narratage/component-kit";
import {
  compositionContractsComponent,
  compositionValidatorDigests,
  contractTypes,
  sealProgramSpace,
  sealSpeechBasis,
  videoContractDependencies,
  videoContractManifests,
} from "@narratage/video-contracts";
import type { SpeechBasis } from "@narratage/video-contracts";
import {
  createResolvedClosure,
  digestOf,
  link,
  recordDigest,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypeValidationReceipt,
  sealTypedModule,
  start,
} from "@narratage/core";
import { ProducerRegistry, NodeDriver } from "@narratage/driver-node";
import type {
  BuildRequest,
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";
import {
  projectSpeechAudio,
  projectSpeechAudioTrack,
  projectSpeechProgramSpace,
  projectSpeechVisual,
  speechTakeComponent,
  speechTakeManifest,
  speechTakeProducers,
} from "@narratage/speech-take";
import { TypeValidatorRegistry } from "@narratage/validation";

const testModule = { name: "example.speech-take-product", version: "0.0.0" } as const;
const requestType = { module: testModule, name: "SpeechRequest" } satisfies TypeRef;
const generateProducer = { module: testModule, name: "generate-speech-take" } satisfies ProducerRef;
const generateImplementationDigest = digestOf("example.speech-take-product/generate@1");

const testManifest: ModuleManifest = {
  format: "svml.module@1",
  name: testModule.name,
  version: testModule.version,
  dependencies: [videoContractDependencies.speech],
  types: [{ name: requestType.name, schema: { kind: "string", minLength: 1 } }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: generateProducer.name,
    inputs: [{ name: "request", type: requestType }],
    outputs: [{ name: "take", type: contractTypes.speechBasis }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.speech-take-product/generate",
      digest: generateImplementationDigest,
    },
  }],
};

const closure = createResolvedClosure([...videoContractManifests, speechTakeManifest, testManifest]);

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionContractsComponent.validators);
  return registry;
}

function sampleTake(label = "generated"): SpeechBasis {
  const durationSec = 2;
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const audio = {
    digest: digestOf(`${label}:audio`),
    size: 12,
    mediaType: "audio/wav",
    durationSec,
  };
  const visual = {
    digest: digestOf(`${label}:visual`),
    size: 24,
    mediaType: "video/mp4",
    durationSec,
  };
  return sealSpeechBasis({
    contract: "svml.speech-basis@1",
    programSpace,
    audio,
    visualTrack: {
      clips: [{ segmentId: "opening", artifact: visual, startSec: 0, endSec: durationSec }],
    },
    segments: [{
      segmentId: "opening",
      startSec: 0,
      endSec: durationSec,
    }],
  });
}

function createProgram(): LinkedProgram {
  const request = sealRecord({
    id: "request:opening",
    type: requestType,
    value: { kind: "inline", value: "Generate the opening speech take." },
    conformance: "exact",
    origin: {
      kind: "authored",
      sourceDigest: digestOf("source:speech-take-product"),
      frontendClosureDigest: digestOf("frontend:speech-take-product"),
    },
  });
  return link(closure, [sealTypedModule({
    id: "author:speech-take-product",
    closureDigest: closure.digest,
    records: [request],
  })]);
}

function createGraph(program: LinkedProgram): CompiledGraph {
  const record = (id: string) => ({ kind: "record" as const, id });
  const output = (id: string) => ({ kind: "logical-output" as const, id });
  const operation = (id: string) => ({ kind: "operation-result" as const, operation: id });
  const existingTake = sampleTake("approved");
  const existingVisual = projectSpeechVisual(existingTake);
  const existingVisualValue = { kind: "inline" as const, value: existingVisual };
  const existingVisualValidation = sealTypeValidationReceipt({
    type: contractTypes.visualTrack,
    recordDigest: recordDigest(contractTypes.visualTrack, existingVisualValue),
    validatorDigest: compositionValidatorDigests.visualTrack,
  });
  return sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      {
        id: "opening.take",
        type: contractTypes.speechBasis,
        primary: "opening.take.generate",
        semanticInputs: [record("request:opening")],
      },
      {
        id: "opening.audio",
        type: contractTypes.speechAudioBasis,
        primary: "opening.audio.project",
        semanticInputs: [output("opening.take")],
      },
      {
        id: "opening.visual",
        type: contractTypes.visualTrack,
        primary: "opening.visual.project",
        semanticInputs: [output("opening.take")],
      },
    ],
    candidates: [
      {
        id: "opening.take.generate",
        type: contractTypes.speechBasis,
        root: { kind: "operation", result: operation("generate-opening") },
      },
      {
        id: "opening.take.existing",
        type: contractTypes.speechBasis,
        root: {
          kind: "value",
          value: {
            id: "provided:opening-take",
            value: { kind: "inline", value: existingTake },
            provenance: { library: "approved-takes", take: "opening-v2" },
          },
        },
      },
      {
        id: "opening.audio.project",
        type: contractTypes.speechAudioBasis,
        root: { kind: "operation", result: operation("project-opening-audio") },
      },
      {
        id: "opening.visual.project",
        type: contractTypes.visualTrack,
        root: { kind: "operation", result: operation("project-opening-visual") },
      },
      {
        id: "opening.visual.existing",
        type: contractTypes.visualTrack,
        root: {
          kind: "value",
          value: {
            id: "provided:opening-visual",
            value: existingVisualValue,
            provenance: { library: "approved-clips", clip: "opening-v3" },
            validation: existingVisualValidation,
          },
        },
      },
    ],
    operations: [
      {
        id: "generate-opening",
        producer: generateProducer,
        inputs: { request: record("request:opening") },
        result: { kind: "output", name: "take", record: "take:opening" },
      },
      {
        id: "project-opening-audio",
        producer: speechTakeProducers.projectAudio,
        inputs: { basis: output("opening.take") },
        result: { kind: "output", name: "audio", record: "audio:opening" },
      },
      {
        id: "project-opening-visual",
        producer: speechTakeProducers.projectVisual,
        inputs: { basis: output("opening.take") },
        result: { kind: "output", name: "visual", record: "visual:opening" },
      },
    ],
  });
}

function build(
  targetAccepts: Readonly<Record<string, "exact" | "substitute">>,
  satisfactionMap: Readonly<Record<string, string>> = {},
) {
  const program = createProgram();
  const graph = createGraph(program);
  const request: BuildRequest = sealBuildRequest({
    graph: graph.id,
    targets: Object.entries(targetAccepts).map(([outputId, accepts]) => ({ output: outputId, accepts })),
    satisfactions: Object.entries(satisfactionMap).map(([outputId, candidate]) => ({
      output: outputId,
      candidate,
      fidelity: candidate === "opening.visual.existing" ? "substitute" as const : "exact" as const,
    })),
  });
  return start(program, graph, request);
}

function stepIds(state: ReturnType<typeof build>): string[] {
  return state.plan.steps.map((step) => step.id).sort();
}

test("SpeechBasis is one Product and audio/visual are ordinary shared projections", () => {
  const state = build({ "opening.audio": "exact", "opening.visual": "exact" });
  assert.deepEqual(stepIds(state), [
    "generate-opening",
    "project-opening-audio",
    "project-opening-visual",
  ]);
  assert.equal(state.plan.steps.filter((step) => step.id === "generate-opening").length, 1);
  assert.equal(
    state.plan.steps.find((step) => step.id === "project-opening-audio")?.inputs.basis,
    "take:opening",
  );
  assert.equal(
    state.plan.steps.find((step) => step.id === "project-opening-visual")?.inputs.basis,
    "take:opening",
  );
});

test("the component enumerates every Manifest-declared SpeechTake projection", () => {
  const declared = speechTakeManifest.producers.map((producer) => ({
    name: producer.name,
    digest: producer.implementation.digest,
  })).sort((left, right) => left.name.localeCompare(right.name));
  const implemented = speechTakeComponent.producers.map((facet) => ({
    name: facet.producer.name,
    digest: facet.implementationDigest,
  })).sort((left, right) => left.name.localeCompare(right.name));
  assert.deepEqual(implemented, declared);
});

test("SpeechBasis projects to peer generic visual and audio Tracks", () => {
  const take = sampleTake();
  const visual = projectSpeechVisual(take);
  const audio = projectSpeechAudioTrack(take);
  const programSpace = projectSpeechProgramSpace(take);
  assert.equal(visual.contract, "svml.visual-track@1");
  assert.equal(audio.contract, "svml.audio-track@1");
  assert.deepEqual(programSpace, take.programSpace);
  assert.equal(visual.presents[0]?.span.endFrameExclusive, audio.clips[0]?.span.endFrameExclusive);
});

test("a substitute visual Candidate does not contaminate an independent exact audio path", () => {
  const state = build(
    { "opening.audio": "exact", "opening.visual": "substitute" },
    { "opening.visual": "opening.visual.existing" },
  );
  assert.deepEqual(stepIds(state), ["generate-opening", "project-opening-audio"]);
  assert.equal(
    state.plan.selections.find((selection) => selection.output === "opening.audio")?.record,
    "audio:opening",
  );
  assert.equal(
    state.plan.selections.find((selection) => selection.output === "opening.visual")?.record,
    "provided:opening-visual",
  );
});

test("selecting an Existing SpeechTake stops generation but keeps both projections", () => {
  const state = build(
    { "opening.audio": "exact", "opening.visual": "exact" },
    { "opening.take": "opening.take.existing" },
  );
  assert.deepEqual(stepIds(state), ["project-opening-audio", "project-opening-visual"]);
  assert.deepEqual(state.plan.initialValues.map((record) => record.id), ["provided:opening-take"]);
  assert.equal(
    state.plan.steps.find((step) => step.id === "project-opening-audio")?.inputs.basis,
    "provided:opening-take",
  );
});

test("the Build Machine executes one shared generation for both projected outputs", async () => {
  let generations = 0;
  const registry = new ProducerRegistry();
  registry.registerProducer(generateProducer, generateImplementationDigest, () => {
    generations += 1;
    return { outputs: { take: { kind: "inline", value: sampleTake() } }, needs: {} };
  });
  registerProducerFacets(registry, speechTakeComponent.producers);
  const result = await new NodeDriver({ producers: registry, validators: validatorRegistry() }).run(
    build({ "opening.audio": "exact", "opening.visual": "exact" }),
  );
  assert.equal(result.status, "complete");
  assert.equal(generations, 1);
});
