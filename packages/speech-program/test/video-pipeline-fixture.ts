import { captionManifest } from "@svml/caption";
import {
  contractTypes,
  videoContractDependencies,
  videoContractManifests,
} from "@svml/contracts";
import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";
import {
  bindAuthorFragment,
  bindCandidateFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
  sealGraphFragment,
} from "@svml/elaborator";
import type {
  BuildState,
  CapabilityRef,
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@svml/protocol";
import { resolveRealization, sealRealizationOverlay } from "@svml/realization";
import { narrativeValue, parseScript } from "@svml/script";
import { speechAlignManifest } from "@svml/speech-align";
import { speechTakeManifest } from "@svml/speech-take";
import {
  captionTimingFragment,
  speechTakeProjectionFragment,
  whisperXSpeechAlignmentFragment,
} from "@svml/speech-program";
import { whisperXManifest, whisperXTypes } from "@svml/whisperx";

export const videoModule = { name: "example.video-pipeline", version: "0.0.0" } as const;

export const videoTypes = {
  estimate: { module: videoModule, name: "OfficialSpeechDurationEstimate" },
  seedanceMiniMedia: { module: videoModule, name: "SeedanceMiniSpeechMedia" },
} satisfies Record<string, TypeRef>;

export const videoCapabilities = {
  estimate: { module: videoModule, name: "official-speech-duration-estimate" },
  seedanceMini: { module: videoModule, name: "seedance-mini-speech-media" },
} satisfies Record<string, CapabilityRef>;

export const videoProducers = {
  requestEstimate: { module: videoModule, name: "request-official-speech-estimate" },
  placeholderEstimate: { module: videoModule, name: "placeholder-speech-estimate" },
  requestSeedanceMini: { module: videoModule, name: "request-seedance-mini-speech" },
  assembleBasis: { module: videoModule, name: "assemble-speech-basis" },
} satisfies Record<string, ProducerRef>;

export const videoImplementations = Object.fromEntries(
  Object.entries(videoProducers).map(([name]) => [name, digestOf(`example.video-pipeline/${name}@1`)]),
) as Readonly<Record<keyof typeof videoProducers, ReturnType<typeof digestOf>>>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({
  kind: "object",
  fields,
});

export const videoManifest: ModuleManifest = {
  format: "svml.module@0",
  name: videoModule.name,
  version: videoModule.version,
  dependencies: [
    videoContractDependencies.narrative,
    videoContractDependencies.speech,
  ],
  types: [
    { name: videoTypes.estimate.name, schema: object({ durationSec: { schema: number } }) },
    {
      name: videoTypes.seedanceMiniMedia.name,
      schema: object({
        model: { schema: { kind: "literal", value: "mini" } },
        audioDigest: { schema: string },
        visualDigest: { schema: string },
        durationSec: { schema: number },
      }),
    },
  ],
  capabilities: [
    { name: videoCapabilities.estimate.name, returns: videoTypes.estimate },
    { name: videoCapabilities.seedanceMini.name, returns: videoTypes.seedanceMiniMedia },
  ],
  surfaces: [],
  producers: [
    {
      name: videoProducers.requestEstimate.name,
      inputs: [{ name: "narrative", type: contractTypes.narrative }],
      outputs: [],
      needs: [{
        name: "estimate",
        capability: videoCapabilities.estimate,
        returns: videoTypes.estimate,
      }],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/request-estimate",
        digest: videoImplementations.requestEstimate,
      },
    },
    {
      name: videoProducers.requestSeedanceMini.name,
      inputs: [
        { name: "narrative", type: contractTypes.narrative },
        { name: "estimate", type: videoTypes.estimate },
      ],
      outputs: [],
      needs: [{
        name: "media",
        capability: videoCapabilities.seedanceMini,
        returns: videoTypes.seedanceMiniMedia,
      }],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/request-seedance-mini",
        digest: videoImplementations.requestSeedanceMini,
      },
    },
    {
      name: videoProducers.placeholderEstimate.name,
      inputs: [{ name: "narrative", type: contractTypes.narrative }],
      outputs: [{ name: "estimate", type: videoTypes.estimate }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/placeholder-estimate",
        digest: videoImplementations.placeholderEstimate,
      },
    },
    {
      name: videoProducers.assembleBasis.name,
      inputs: [
        { name: "narrative", type: contractTypes.narrative },
        { name: "media", type: videoTypes.seedanceMiniMedia },
      ],
      outputs: [{
        name: "basis",
        type: contractTypes.speechBasis,
        affinity: [{
          resultPointer: "/narrativeDigest",
          input: "narrative",
          inputPointer: "/semanticIndex/digest",
        }],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/assemble-basis",
        digest: videoImplementations.assembleBasis,
      },
    },
  ],
};

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

const durationEstimateFragment = sealGraphFragment({
  name: "example.video-pipeline/duration-estimate@1",
  inputs: [{ name: "narrative", type: contractTypes.narrative }],
  operations: [{
    id: "estimate",
    producer: videoProducers.requestEstimate,
    inputs: { narrative: input("narrative") },
    result: { kind: "need", name: "estimate", accepts: "exact" },
  }],
  exports: [{
    name: "estimate",
    type: videoTypes.estimate,
    root: operation("estimate"),
    semanticInputs: ["narrative"],
    fidelity: "exact",
  }],
});

const speechTakeGenerationFragment = sealGraphFragment({
  name: "example.video-pipeline/seedance-mini-speech-take@1",
  inputs: [
    { name: "narrative", type: contractTypes.narrative },
    { name: "estimate", type: videoTypes.estimate },
  ],
  operations: [
    {
      id: "request-seedance-mini",
      producer: videoProducers.requestSeedanceMini,
      inputs: { narrative: input("narrative"), estimate: input("estimate") },
      result: { kind: "need", name: "media", accepts: "exact" },
    },
    {
      id: "assemble-take",
      producer: videoProducers.assembleBasis,
      inputs: { narrative: input("narrative"), media: operation("request-seedance-mini") },
      result: { kind: "output", name: "basis" },
    },
  ],
  exports: [{
    name: "take",
    type: contractTypes.speechBasis,
    root: operation("assemble-take"),
    semanticInputs: ["narrative", "estimate"],
    affinity: [{
      resultPointer: "/narrativeDigest",
      source: input("narrative"),
      sourcePointer: "/semanticIndex/digest",
    }],
    fidelity: "exact",
  }],
});

const placeholderEstimateFragment = sealGraphFragment({
  name: "example.video-pipeline/placeholder-estimate@1",
  inputs: [{ name: "narrative", type: contractTypes.narrative }],
  operations: [{
    id: "placeholder",
    producer: videoProducers.placeholderEstimate,
    inputs: { narrative: input("narrative") },
    result: { kind: "output", name: "estimate" },
  }],
  exports: [{
    name: "estimate",
    type: videoTypes.estimate,
    root: operation("placeholder"),
    semanticInputs: ["narrative"],
    fidelity: "substitute",
  }],
});

export const videoOutputs = {
  estimate: "speech.estimate",
  take: "speech.take",
  programSpace: "speech.program-space",
  audio: "speech.audio",
  audioTrack: "speech.audio-track",
  visual: "speech.visual",
  rawEvidence: "speech.whisperx-evidence",
  evidence: "speech.evidence",
  map: "speech.map",
  caption: "speech.caption",
} as const;

export type VideoOutputName = keyof typeof videoOutputs;

export const videoClosure = createResolvedClosure([
  ...videoContractManifests,
  videoManifest,
  speechTakeManifest,
  whisperXManifest,
  speechAlignManifest,
  captionManifest,
]);

function authorProgram(): LinkedProgram {
  const parsed = parseScript("pipeline.svml", "<line><that was insane | what the fuck></line>");
  const narrative = sealRecord({
    id: "narrative:root",
    type: contractTypes.narrative,
    value: { kind: "inline", value: narrativeValue(parsed) },
    conformance: "exact",
    origin: {
      kind: "authored",
      sourceDigest: digestOf("source:video-pipeline"),
      frontendClosureDigest: digestOf("frontend:script"),
      sourceName: "pipeline.svml",
    },
  });
  return link(videoClosure, [sealTypedModule({
    id: "author:video-pipeline",
    closureDigest: videoClosure.digest,
    records: [narrative],
  })]);
}

export function createVideoGraph(program: LinkedProgram): CompiledGraph {
  const narrative = { kind: "record" as const, id: "narrative:root" };
  const estimate = elaborateGraphFragment(program, durationEstimateFragment, {
    id: "opening.estimate",
    fragment: durationEstimateFragment.id,
    inputs: { narrative },
  });
  const take = elaborateGraphFragment(program, speechTakeGenerationFragment, {
    id: "opening.seedance-mini",
    fragment: speechTakeGenerationFragment.id,
    inputs: {
      narrative,
      estimate: { kind: "logical-output", id: videoOutputs.estimate },
    },
  });
  const projections = elaborateGraphFragment(program, speechTakeProjectionFragment, {
    id: "opening.take-projections",
    fragment: speechTakeProjectionFragment.id,
    inputs: { take: { kind: "logical-output", id: videoOutputs.take } },
  });
  const alignment = elaborateGraphFragment(program, whisperXSpeechAlignmentFragment, {
    id: "opening.whisperx-alignment",
    fragment: whisperXSpeechAlignmentFragment.id,
    inputs: {
      narrative,
      audio: { kind: "logical-output", id: videoOutputs.audio },
    },
  });
  const caption = elaborateGraphFragment(program, captionTimingFragment, {
    id: "opening.caption",
    fragment: captionTimingFragment.id,
    inputs: {
      narrative,
      map: { kind: "logical-output", id: videoOutputs.map },
    },
  });
  const contribution = mergeFragmentContributions(
    { outputs: [], candidates: [], operations: [] },
    bindAuthorFragment(estimate, { estimate: videoOutputs.estimate }),
    bindAuthorFragment(take, { take: videoOutputs.take }),
    bindAuthorFragment(projections, {
      programSpace: videoOutputs.programSpace,
      audio: videoOutputs.audio,
      audioTrack: videoOutputs.audioTrack,
      visual: videoOutputs.visual,
    }),
    bindAuthorFragment(alignment, {
      rawEvidence: videoOutputs.rawEvidence,
      evidence: videoOutputs.evidence,
      map: videoOutputs.map,
    }),
    bindAuthorFragment(caption, { caption: videoOutputs.caption }),
  );
  return sealCompiledGraph({ program: program.semanticDigest, ...contribution });
}

export type VideoBuildOptions = {
  readonly estimateRealization?: "primary" | "placeholder";
  readonly goalAccepts?: "exact" | "substitute";
  readonly targets?: readonly VideoOutputName[];
};

export type VideoFixture = {
  readonly program: LinkedProgram;
  readonly source: CompiledGraph;
  readonly graph: CompiledGraph;
  readonly bindings: readonly { readonly output: string; readonly candidate: string }[];
};

export function createVideoFixture(options: VideoBuildOptions = {}): VideoFixture {
  const program = authorProgram();
  const source = createVideoGraph(program);
  if (options.estimateRealization !== "placeholder") {
    return { program, source, graph: source, bindings: [] };
  }
  const placeholder = elaborateGraphFragment(program, placeholderEstimateFragment, {
    id: "opening.placeholder-estimate",
    fragment: placeholderEstimateFragment.id,
    inputs: { narrative: { kind: "record", id: "narrative:root" } },
  });
  const contribution = bindCandidateFragment(placeholder, { estimate: videoOutputs.estimate });
  const overlay = sealRealizationOverlay({
    sourceGraph: source.id,
    candidates: contribution.candidates,
    operations: contribution.operations,
  });
  const realized = resolveRealization(program, source, [overlay]);
  return {
    program,
    source,
    graph: realized.graph,
    bindings: [{ output: videoOutputs.estimate, candidate: contribution.candidates[0]!.id }],
  };
}

export function createVideoBuild(options: VideoBuildOptions = {}): BuildState {
  const fixture = createVideoFixture(options);
  const accepts = options.goalAccepts ?? "exact";
  const targets = options.targets ?? ["caption"];
  const request = sealBuildRequest({
    graph: fixture.graph.id,
    targets: targets.map((name) => ({ output: videoOutputs[name], accepts })),
    bindings: fixture.bindings,
  });
  return start(fixture.program, fixture.graph, request);
}

export { contractTypes, whisperXTypes };
