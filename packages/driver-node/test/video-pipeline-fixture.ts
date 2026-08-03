import { captionManifest, captionProducers } from "@svml/caption";
import {
  contractTypes,
  contractsManifest,
  contractsManifestDigest,
  contractsModuleRef,
} from "@svml/contracts";
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
import { narrativeValue, parseScript } from "@svml/script";
import { speechAlignManifest, speechAlignProducers } from "@svml/speech-align";
import {
  whisperXManifest,
  whisperXProducers,
  whisperXTypes,
} from "@svml/whisperx";

export const videoModule = { name: "example.video-pipeline", version: "0.0.0" } as const;

export const videoTypes = {
  estimate: { module: videoModule, name: "OfficialSpeechDurationEstimate" },
  seedanceMiniMedia: { module: videoModule, name: "SeedanceMiniSpeechMedia" },
} satisfies Record<string, TypeRef>;

export const videoProducers = {
  requestEstimate: { module: videoModule, name: "request-official-speech-estimate" },
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
  dependencies: [{ module: contractsModuleRef, digest: contractsManifestDigest }],
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
  surfaces: [],
  producers: [
    {
      name: videoProducers.requestEstimate.name,
      inputs: [{ name: "narrative", type: contractTypes.narrative }],
      outputs: [],
      needs: [{ name: "estimate", wants: videoTypes.estimate }],
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
      needs: [{ name: "media", wants: videoTypes.seedanceMiniMedia }],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/request-seedance-mini",
        digest: videoImplementations.requestSeedanceMini,
      },
    },
    {
      name: videoProducers.assembleBasis.name,
      inputs: [{ name: "media", type: videoTypes.seedanceMiniMedia }],
      outputs: [{ name: "basis", type: contractTypes.speechBasis }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.video-pipeline/assemble-basis",
        digest: videoImplementations.assembleBasis,
      },
    },
  ],
};

export const videoPlan: BuildPlan = {
  format: "svml.plan@0",
  id: "explicit-whisperx-video-pipeline",
  steps: [
    {
      id: "request-estimate",
      producer: videoProducers.requestEstimate,
      inputs: { narrative: "narrative:root" },
      outputs: {},
      needs: { estimate: { id: "need:estimate", result: "estimate:root", accepts: "exact" } },
    },
    {
      id: "request-seedance-mini",
      producer: videoProducers.requestSeedanceMini,
      inputs: { narrative: "narrative:root", estimate: "estimate:root" },
      outputs: {},
      needs: { media: { id: "need:seedance-mini", result: "seedance-media:root", accepts: "exact" } },
    },
    {
      id: "assemble-basis",
      producer: videoProducers.assembleBasis,
      inputs: { media: "seedance-media:root" },
      outputs: { basis: "basis:root" },
      needs: {},
    },
    {
      id: "request-whisperx",
      producer: whisperXProducers.request,
      inputs: { basis: "basis:root" },
      outputs: {},
      needs: { alignment: { id: "need:whisperx", result: "whisperx:root", accepts: "exact" } },
    },
    {
      id: "normalize-whisperx",
      producer: whisperXProducers.normalize,
      inputs: { whisperx: "whisperx:root" },
      outputs: { evidence: "evidence:root" },
      needs: {},
    },
    {
      id: "locate-speech",
      producer: speechAlignProducers.locate,
      inputs: { narrative: "narrative:root", basis: "basis:root", evidence: "evidence:root" },
      outputs: { map: "speech-map:root" },
      needs: {},
    },
    {
      id: "temporalize-caption",
      producer: captionProducers.temporalize,
      inputs: { narrative: "narrative:root", map: "speech-map:root" },
      outputs: { caption: "caption:root" },
      needs: {},
    },
  ],
  goals: [{ record: "caption:root", type: contractTypes.timedCaptionProjection, accepts: "exact" }],
};

export const videoClosure = createResolvedClosure([
  contractsManifest,
  videoManifest,
  whisperXManifest,
  speechAlignManifest,
  captionManifest,
]);

export function createVideoBuild(): BuildState {
  const parsed = parseScript(
    "pipeline.svml",
    "<line><that was insane | what the fuck></line>",
  );
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
  return start(link(videoClosure, [sealTypedModule({
    id: "author:video-pipeline",
    closureDigest: videoClosure.digest,
    records: [narrative],
  })]), videoPlan);
}

export { contractTypes, whisperXTypes };
