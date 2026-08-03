import {
  createResolvedClosure,
  digestOf,
  link,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";
import type {
  BuildPlan,
  BuildState,
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@svml/protocol";

export const videoModule = { name: "example.video-pipeline", version: "0.0.0" } as const;

export const videoTypes = {
  narrative: { module: videoModule, name: "Narrative" },
  schedule: { module: videoModule, name: "SpeechSchedule" },
  basis: { module: videoModule, name: "SpeechBasis" },
  evidence: { module: videoModule, name: "AlignedTranscriptEvidence" },
  speechMap: { module: videoModule, name: "CompleteSpeechTimeMap" },
  caption: { module: videoModule, name: "TimedCaption" },
} satisfies Record<string, TypeRef>;

export const videoProducers = {
  requestEstimate: { module: videoModule, name: "request-estimate" },
  requestGeneration: { module: videoModule, name: "request-generation" },
  requestRecognition: { module: videoModule, name: "request-recognition" },
  locateSpeech: { module: videoModule, name: "locate-speech" },
  temporalizeCaption: { module: videoModule, name: "temporalize-caption" },
} satisfies Record<string, ProducerRef>;

export const videoImplementations = Object.fromEntries(
  Object.entries(videoProducers).map(([name]) => [name, digestOf(`example.video-pipeline/${name}@0`)]),
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
  dependencies: [],
  types: [
    { name: videoTypes.narrative.name, schema: object({ speech: { schema: string }, display: { schema: string } }) },
    { name: videoTypes.schedule.name, schema: object({ durationSec: { schema: number } }) },
    { name: videoTypes.basis.name, schema: object({ audio: { schema: string }, visual: { schema: string } }) },
    { name: videoTypes.evidence.name, schema: object({ transcript: { schema: string } }) },
    { name: videoTypes.speechMap.name, schema: object({ startSec: { schema: number }, endSec: { schema: number } }) },
    {
      name: videoTypes.caption.name,
      schema: object({ text: { schema: string }, startSec: { schema: number }, endSec: { schema: number } }),
    },
  ],
  surfaces: [],
  producers: [
    {
      name: videoProducers.requestEstimate.name,
      inputs: [{ name: "narrative", type: videoTypes.narrative }],
      outputs: [],
      needs: [{ name: "schedule", wants: videoTypes.schedule }],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/request-estimate",
        digest: videoImplementations.requestEstimate,
      },
    },
    {
      name: videoProducers.requestGeneration.name,
      inputs: [
        { name: "narrative", type: videoTypes.narrative },
        { name: "schedule", type: videoTypes.schedule },
      ],
      outputs: [],
      needs: [{ name: "basis", wants: videoTypes.basis }],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/request-generation",
        digest: videoImplementations.requestGeneration,
      },
    },
    {
      name: videoProducers.requestRecognition.name,
      inputs: [{ name: "basis", type: videoTypes.basis }],
      outputs: [],
      needs: [{ name: "evidence", wants: videoTypes.evidence }],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/request-recognition",
        digest: videoImplementations.requestRecognition,
      },
    },
    {
      name: videoProducers.locateSpeech.name,
      inputs: [
        { name: "narrative", type: videoTypes.narrative },
        { name: "evidence", type: videoTypes.evidence },
      ],
      outputs: [{ name: "map", type: videoTypes.speechMap }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/locate-speech",
        digest: videoImplementations.locateSpeech,
      },
    },
    {
      name: videoProducers.temporalizeCaption.name,
      inputs: [
        { name: "narrative", type: videoTypes.narrative },
        { name: "map", type: videoTypes.speechMap },
      ],
      outputs: [{ name: "caption", type: videoTypes.caption }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/temporalize-caption",
        digest: videoImplementations.temporalizeCaption,
      },
    },
  ],
};

export const videoPlan: BuildPlan = {
  format: "svml.plan@0",
  id: "video-pipeline",
  steps: [
    {
      id: "request-estimate",
      producer: videoProducers.requestEstimate,
      inputs: { narrative: "narrative:root" },
      outputs: {},
      needs: { schedule: { id: "need:schedule", result: "schedule:root", accepts: "exact" } },
    },
    {
      id: "request-generation",
      producer: videoProducers.requestGeneration,
      inputs: { narrative: "narrative:root", schedule: "schedule:root" },
      outputs: {},
      needs: { basis: { id: "need:basis", result: "basis:root", accepts: "exact" } },
    },
    {
      id: "request-recognition",
      producer: videoProducers.requestRecognition,
      inputs: { basis: "basis:root" },
      outputs: {},
      needs: { evidence: { id: "need:evidence", result: "evidence:root", accepts: "exact" } },
    },
    {
      id: "locate-speech",
      producer: videoProducers.locateSpeech,
      inputs: { narrative: "narrative:root", evidence: "evidence:root" },
      outputs: { map: "speech-map:root" },
      needs: {},
    },
    {
      id: "temporalize-caption",
      producer: videoProducers.temporalizeCaption,
      inputs: { narrative: "narrative:root", map: "speech-map:root" },
      outputs: { caption: "caption:root" },
      needs: {},
    },
  ],
  goals: [{ record: "caption:root", type: videoTypes.caption, accepts: "exact" }],
};

export function createVideoBuild(): BuildState {
  const closure = createResolvedClosure([videoManifest]);
  const narrative = sealRecord({
    id: "narrative:root",
    type: videoTypes.narrative,
    value: { kind: "inline", value: { speech: "what the fuck", display: "that was insane" } },
    conformance: "exact",
    origin: {
      kind: "authored",
      sourceDigest: digestOf("source:video-pipeline"),
      frontendClosureDigest: digestOf("frontend:script"),
      sourceName: "pipeline.svml",
    },
  });
  return start(link(closure, [sealTypedModule({
    id: "author:video-pipeline",
    closureDigest: closure.digest,
    records: [narrative],
  })]), videoPlan);
}
