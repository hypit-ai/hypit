import {
  contractTypes,
  videoContractDependencies,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";
import { svsManifest, svsRecipeType } from "@svml/svs";

import { estimateSpeechImplementationDigest } from "./program.js";

export const estimateModuleRef = { name: "@svml/estimate", version: "0.0.0-dev" } as const;
export const estimateTypes = {
  speechPolicy: { module: estimateModuleRef, name: "SpeechEstimatePolicy" },
} satisfies Record<string, TypeRef>;
export const estimateProducers = {
  speech: { module: estimateModuleRef, name: "estimate-speech-duration" },
} satisfies Record<string, ProducerRef>;
export const estimateSurfaceImplementationDigest = digestOf("@svml/estimate/speech-surface@2");

const number = { kind: "number" } as const satisfies ValueSchema;
const speechEstimatePolicySchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.speech-estimate-policy@1" } },
    language: { schema: { kind: "string", enum: ["auto", "en", "zh", "ja", "es"] } },
    pace: { schema: { kind: "string", enum: ["slow", "normal", "fast"] } },
    paddingSec: { schema: number },
    minimumSec: { schema: number },
    maximumSec: { schema: number },
    rounding: { schema: { kind: "string", enum: ["none", "round", "ceil"] } },
  },
};

export const estimateManifest: ModuleManifest = {
  format: "svml.module@1",
  name: estimateModuleRef.name,
  version: estimateModuleRef.version,
  dependencies: [
    videoContractDependencies.narrative,
    videoContractDependencies.speech,
    { module: svsRecipeType.module, digest: digestOf(svsManifest) },
  ],
  types: [{ name: estimateTypes.speechPolicy.name, schema: speechEstimatePolicySchema }],
  capabilities: [],
  surfaces: [{
    name: "speech",
    tag: "Speech",
    mode: "structured",
    outputs: [estimateTypes.speechPolicy, contractTypes.speechDuration],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@svml/estimate/speech-surface",
      digest: estimateSurfaceImplementationDigest,
    },
  }],
  producers: [{
    name: estimateProducers.speech.name,
    inputs: [
      { name: "speech", type: contractTypes.narrativeSpeechExcerpt },
      { name: "policy", type: estimateTypes.speechPolicy },
    ],
    outputs: [{ name: "duration", type: contractTypes.speechDuration }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@svml/estimate/estimate-speech",
      digest: estimateSpeechImplementationDigest,
    },
  }],
};

export const estimateManifestDigest = digestOf(estimateManifest);
export { speechEstimatePolicySchema };
