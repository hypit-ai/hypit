import { compositionComponent, videoContractManifests } from "../../test-support/video-domain.js";
import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@narratage/component-kit";
import { sealProgramSpace } from "@narratage/program-space";
import { sealSpeechBasis, speechDependency, speechTypes } from "@narratage/speech";
import type { SpeechBasis } from "@narratage/speech";
import { compositionTypes, compositionValidatorDigests } from "@narratage/composition";
import assert from "node:assert/strict";
import test from "node:test";

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
  speechBasisComponent,
  speechBasisManifest,
  speechBasisProducers,
} from "@narratage/speech-basis";
import { TypeValidatorRegistry } from "@narratage/validation";

const testModule = { name: "example.speech-basis-product", version: "0.0.0" } as const;
const requestType = { module: testModule, name: "SpeechRequest" } satisfies TypeRef;
const generateProducer = { module: testModule, name: "generate-speech-basis" } satisfies ProducerRef;
const generateImplementationDigest = digestOf("example.speech-basis-product/generate@1");

const testManifest: ModuleManifest = {
  format: "svml.module@1",
  name: testModule.name,
  version: testModule.version,
  dependencies: [speechDependency],
  types: [{ name: requestType.name, schema: { kind: "string", minLength: 1 } }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: generateProducer.name,
    inputs: [{ name: "request", type: requestType }],
    outputs: [{ name: "take", type: speechTypes.basis }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.speech-basis-product/generate",
      digest: generateImplementationDigest,
    },
  }],
};

const closure = createResolvedClosure([...videoContractManifests, speechBasisManifest, testManifest]);

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionComponent.validators);
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
    kind: "blob" as const,
    digest: digestOf(`${label}:audio`),
    size: 12,
    mediaType: "audio/wav",
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
      sourceDigest: digestOf("source:speech-basis-product"),
      frontendClosureDigest: digestOf("frontend:speech-basis-product"),
    },
  });
  return link(closure, [sealTypedModule({
    id: "author:speech-basis-product",
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
    type: compositionTypes.visualTrack,
    recordDigest: recordDigest(compositionTypes.visualTrack, existingVisualValue),
    validatorDigest: compositionValidatorDigests.visualTrack,
  });
  return sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      {
        id: "opening.take",
        type: speechTypes.basis,
        primary: "opening.take.generate",
        semanticInputs: [record("request:opening")],
      },
      {
        id: "opening.audio",
        type: speechTypes.audioBasis,
        primary: "opening.audio.project",
        semanticInputs: [output("opening.take")],
      },
      {
        id: "opening.visual",
        type: compositionTypes.visualTrack,
        primary: "opening.visual.project",
        semanticInputs: [output("opening.take")],
      },
    ],
    candidates: [
      {
        id: "opening.take.generate",
        type: speechTypes.basis,
        root: { kind: "operation", result: operation("generate-opening") },
      },
      {
        id: "opening.take.existing",
        type: speechTypes.basis,
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
        type: speechTypes.audioBasis,
        root: { kind: "operation", result: operation("project-opening-audio") },
      },
      {
        id: "opening.visual.project",
        type: compositionTypes.visualTrack,
        root: { kind: "operation", result: operation("project-opening-visual") },
      },
      {
        id: "opening.visual.existing",
        type: compositionTypes.visualTrack,
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
        producer: speechBasisProducers.projectAudio,
        inputs: { basis: output("opening.take") },
        result: { kind: "output", name: "audio", record: "audio:opening" },
      },
      {
        id: "project-opening-visual",
        producer: speechBasisProducers.projectVisual,
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

test("SpeechBasis projects to peer generic visual and audio Tracks", () => {
  const take = sampleTake();
  const visual = projectSpeechVisual(take);
  const audio = projectSpeechAudioTrack(take);
  const programSpace = projectSpeechProgramSpace(take);
  assert.equal(visual.contract, "svml.visual-track@1");
  assert.equal(audio.contract, "svml.audio-track@1");
  assert.deepEqual(programSpace, take.programSpace);
  assert.equal(
    audio.clips[0]?.target.endSampleExclusive,
    Math.round(visual.presents[0]!.span.endFrameExclusive * 48_000
      * take.programSpace.frameRate.denominator / take.programSpace.frameRate.numerator),
  );
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

test("selecting an Existing SpeechBasis stops generation but keeps both projections", () => {
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
  registerProducerFacets(registry, speechBasisComponent.producers);
  const result = await new NodeDriver({ producers: registry, validators: validatorRegistry() }).run(
    build({ "opening.audio": "exact", "opening.visual": "exact" }),
  );
  assert.equal(result.status, "complete");
  assert.equal(generations, 1);
});
