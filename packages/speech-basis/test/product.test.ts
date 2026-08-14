import { compositionComponent, spatialComponent, videoContractManifests } from "../../../test/support/video-domain.js";
import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@narratage/component-kit";
import { sealProgramSpace } from "@narratage/program-space";
import { sealSpeechBasis, speechDependency, speechTypes } from "@narratage/speech";
import type { SpeechBasis } from "@narratage/speech";
import { compositionTypes } from "@narratage/composition";
import { mediaPipelineManifest } from "@narratage/media-pipeline";
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
import { mediaTrackManifest } from "@narratage/media-track";

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
  producers: [{
    name: generateProducer.name,
    inputs: [{ name: "request", type: requestType }],
    outputs: [{ name: "take", type: speechTypes.basis }],
    needs: [],
    implementation: {
      digest: generateImplementationDigest,
    },
  }],
};

const closure = createResolvedClosure([
  ...videoContractManifests,
  mediaPipelineManifest,
  mediaTrackManifest,
  speechBasisManifest,
  testManifest,
]);

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionComponent.validators);
  registerTypeValidatorFacets(registry, spatialComponent.validators);
  return registry;
}

function sampleTake(label = "generated"): SpeechBasis {
  const durationSec = 2;
  const programSpace = sealProgramSpace({
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
    kind: "blob" as const,
    digest: digestOf(`${label}:visual`),
    size: 24,
    mediaType: "video/mp4",
  };
  return sealSpeechBasis({
    programSpace,
    audio,
    visualTrack: {
      clips: [{
        segmentId: "opening",
        artifact: visual,
        extent: { widthPx: 720, heightPx: 1280 },
        frame: { xPx: 0, yPx: 0, widthPx: 720, heightPx: 1280 },
        fit: {
          sizing: "cover",
          framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
          offsetPx: { x: 0, y: 0 }, constraint: "bounded",
        },
        stackingOrder: 0,
      }],
    },
    segments: [{
      segmentId: "opening",
      startFrame: 0,
      endFrameExclusive: durationSec * 30,
    }],
  });
}

function createProgram(): LinkedProgram {
  const request = sealRecord({
    id: "request:opening",
    type: requestType,
    value: { kind: "inline", value: "Generate the opening speech take." },
    origin: {
      kind: "authored",
    },
  });
  return link(closure, [request]);
}

function createGraph(program: LinkedProgram): CompiledGraph {
  const record = (id: string) => ({ kind: "record" as const, id });
  const output = (id: string) => ({ kind: "logical-output" as const, id });
  const operation = (id: string) => ({ kind: "operation-result" as const, operation: id });
  const existingTake = sampleTake("approved");
  const existingVisual = projectSpeechVisual(existingTake);
  const existingVisualValue = { kind: "inline" as const, value: existingVisual };
  return sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      {
        id: "opening.take",
        type: speechTypes.basis,
        primary: "opening.take.generate",
      },
      {
        id: "opening.audio",
        type: speechTypes.audioBasis,
        primary: "opening.audio.project",
      },
      {
        id: "opening.visual",
        type: compositionTypes.visualTrack,
        primary: "opening.visual.project",
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
  targets: readonly string[],
  satisfactionMap: Readonly<Record<string, string>> = {},
) {
  const program = createProgram();
  const sourceGraph = createGraph(program);
  const graph = sealCompiledGraph({
    program: sourceGraph.program,
    outputs: sourceGraph.outputs.map((item) => ({
      ...item,
      primary: satisfactionMap[item.id] ?? item.primary,
    })),
    candidates: sourceGraph.candidates,
    operations: sourceGraph.operations,
  });
  const request: BuildRequest = sealBuildRequest({
    graph: graph.id,
    targets: targets.map((outputId) => ({ output: outputId })),
  });
  return start(program, graph, request);
}

function stepIds(state: ReturnType<typeof build>): string[] {
  return state.plan.steps.map((step) => step.id).sort();
}

test("SpeechBasis is one Product and audio/visual are ordinary shared projections", () => {
  const state = build(["opening.audio", "opening.visual"]);
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
  assert.equal(visual.kind, "visual");
  assert.equal(audio.kind, "audio");
  assert.deepEqual(programSpace, take.programSpace);
  assert.equal(
    audio.clips[0]?.target.endSampleExclusive,
    Math.round(visual.presents[0]!.span.endFrameExclusive * 48_000
      * take.programSpace.frameRate.denominator / take.programSpace.frameRate.numerator),
  );
});

test("a visual Candidate does not affect an independent audio path", () => {
  const state = build(
    ["opening.audio", "opening.visual"],
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
    ["opening.audio", "opening.visual"],
    { "opening.take": "opening.take.existing" },
  );
  assert.deepEqual(stepIds(state), ["project-opening-audio", "project-opening-visual"]);
  assert.deepEqual(state.records.filter((record) => record.origin.kind === "provided").map((record) => record.id), ["provided:opening-take"]);
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
    build(["opening.audio", "opening.visual"]),
  );
  assert.equal(result.status, "complete");
  assert.equal(generations, 1);
});
