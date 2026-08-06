import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@svml/component-kit";
import {
  compositionContractsComponent,
  compositionValidatorDigests,
  contractTypes,
  sealProgramSpace,
  sealSpeechBasis,
  videoContractDependencies,
  videoContractManifests,
} from "@svml/contracts";
import type { SpeechBasis } from "@svml/contracts";
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
} from "@svml/core";
import { HostRegistry, NodeDriver } from "@svml/driver-node";
import type {
  BuildRequest,
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";
import {
  projectSpeechAudioImplementationDigest,
  projectSpeechAudio,
  projectSpeechAudioTrack,
  projectSpeechProgramSpace,
  projectSpeechVisualImplementationDigest,
  projectSpeechVisual,
  speechTakeManifest,
  speechTakeProducers,
} from "@svml/speech-take";
import { TypeValidatorRegistry } from "@svml/validation";

const testModule = { name: "example.speech-take-product", version: "0.0.0" } as const;
const requestType = { module: testModule, name: "SpeechRequest" } satisfies TypeRef;
const generateProducer = { module: testModule, name: "generate-speech-take" } satisfies ProducerRef;
const generateImplementationDigest = digestOf("example.speech-take-product/generate@1");

const testManifest: ModuleManifest = {
  format: "svml.module@0",
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
    contract: "svml.program-space@0",
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
    narrativeDigest: digestOf("narrative:product-test"),
    programSpace,
    audio,
    visualTrack: {
      clips: [{ segmentId: "opening", artifact: visual, startSec: 0, endSec: durationSec }],
    },
    segments: [{
      segmentId: "opening",
      startSec: 0,
      endSec: durationSec,
      sourceArtifactDigest: audio.digest,
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
        candidates: ["opening.take.generate", "opening.take.existing"],
        semanticInputs: [record("request:opening")],
      },
      {
        id: "opening.audio",
        type: contractTypes.speechAudioBasis,
        primary: "opening.audio.project",
        candidates: ["opening.audio.project"],
        semanticInputs: [output("opening.take")],
        affinity: [{
          resultPointer: "/basisDigest",
          source: output("opening.take"),
          sourcePointer: "/basisDigest",
        }],
      },
      {
        id: "opening.visual",
        type: contractTypes.visualTrack,
        primary: "opening.visual.project",
        candidates: ["opening.visual.project", "opening.visual.existing"],
        semanticInputs: [output("opening.take")],
        affinity: [{
          resultPointer: "/sources/0/digest",
          source: output("opening.take"),
          sourcePointer: "/basisDigest",
        }],
      },
    ],
    candidates: [
      {
        id: "opening.take.generate",
        output: "opening.take",
        root: { kind: "operation", result: operation("generate-opening") },
        fidelity: "exact",
      },
      {
        id: "opening.take.existing",
        output: "opening.take",
        root: {
          kind: "value",
          value: {
            id: "provided:opening-take",
            value: { kind: "inline", value: existingTake },
            provenance: { library: "approved-takes", take: "opening-v2" },
          },
        },
        fidelity: "exact",
      },
      {
        id: "opening.audio.project",
        output: "opening.audio",
        root: { kind: "operation", result: operation("project-opening-audio") },
        fidelity: "exact",
      },
      {
        id: "opening.visual.project",
        output: "opening.visual",
        root: { kind: "operation", result: operation("project-opening-visual") },
        fidelity: "exact",
      },
      {
        id: "opening.visual.existing",
        output: "opening.visual",
        root: {
          kind: "value",
          value: {
            id: "provided:opening-visual",
            value: existingVisualValue,
            provenance: { library: "approved-clips", clip: "opening-v3" },
            validation: existingVisualValidation,
          },
        },
        fidelity: "substitute",
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
  bindings: Readonly<Record<string, string>> = {},
) {
  const program = createProgram();
  const graph = createGraph(program);
  const request: BuildRequest = sealBuildRequest({
    graph: graph.id,
    targets: Object.entries(targetAccepts).map(([outputId, accepts]) => ({ output: outputId, accepts })),
    bindings: Object.entries(bindings).map(([outputId, candidate]) => ({ output: outputId, candidate })),
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
  assert.equal(visual.programSpaceDigest, take.programSpace.digest);
  assert.equal(audio.programSpaceDigest, take.programSpace.digest);
  assert.equal(programSpace.digest, take.programSpace.digest);
  assert.deepEqual(visual.sources, audio.sources);
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
  const registry = new HostRegistry();
  registry.registerProducer(generateProducer, generateImplementationDigest, () => {
    generations += 1;
    return { outputs: { take: { kind: "inline", value: sampleTake() } }, needs: {} };
  });
  registry.registerProducer(
    speechTakeProducers.projectAudio,
    projectSpeechAudioImplementationDigest,
    ({ inputs }) => {
      const value = inputs.basis?.value;
      assert.equal(value?.kind, "inline");
      return {
        outputs: { audio: { kind: "inline", value: projectSpeechAudio(value.value as unknown as SpeechBasis) } },
        needs: {},
      };
    },
  );
  registry.registerProducer(
    speechTakeProducers.projectVisual,
    projectSpeechVisualImplementationDigest,
    ({ inputs }) => {
      const value = inputs.basis?.value;
      assert.equal(value?.kind, "inline");
      return {
        outputs: { visual: { kind: "inline", value: projectSpeechVisual(value.value as unknown as SpeechBasis) } },
        needs: {},
      };
    },
  );
  const result = await new NodeDriver({ registry, validators: validatorRegistry() }).run(
    build({ "opening.audio": "exact", "opening.visual": "exact" }),
  );
  assert.equal(result.status, "complete");
  assert.equal(generations, 1);
});
