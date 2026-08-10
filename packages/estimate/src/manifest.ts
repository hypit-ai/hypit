import { speechDependency, speechTypes } from "@narratage/speech";
import { textDependency, textTypes } from "@narratage/text";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { svsManifest, svsRecipeType } from "@narratage/svs";

import { estimateSpeechImplementationDigest } from "./program.js";

export const estimateModuleRef = { name: "@narratage/estimate", version: "1" } as const;
export const estimateTypes = {
  speechPolicy: { module: estimateModuleRef, name: "SpeechEstimatePolicy" },
} satisfies Record<string, TypeRef>;
export const estimateProducers = {
  speech: { module: estimateModuleRef, name: "estimate-speech-duration" },
} satisfies Record<string, ProducerRef>;
export const estimateSurfaceImplementationDigest = digestOf(
  "@narratage/estimate/speech-surface@1:explicit-policy-without-padding",
);

const number = { kind: "number" } as const satisfies ValueSchema;
const speechEstimatePolicySchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.speech-estimate-policy@1" } },
    language: { schema: { kind: "string", enum: ["auto", "en", "zh", "ja", "es"] } },
    pace: { schema: { kind: "string", enum: ["slow", "normal", "fast"] }, optional: true },
    rate: { schema: { kind: "number", minimum: 0.000001 }, optional: true },
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
    speechDependency,
    textDependency,
    { module: svsRecipeType.module, digest: digestOf(svsManifest) },
  ],
  types: [{ name: estimateTypes.speechPolicy.name, schema: speechEstimatePolicySchema }],
  capabilities: [],
  surfaces: [{
    name: "speech",
    tag: "Speech",
    mode: "structured",
    outputs: [estimateTypes.speechPolicy, speechTypes.duration],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/estimate/speech-surface",
      digest: estimateSurfaceImplementationDigest,
    },
  }],
  producers: [{
    name: estimateProducers.speech.name,
    inputs: [
      { name: "speech", type: textTypes.text },
      { name: "policy", type: estimateTypes.speechPolicy },
    ],
    outputs: [{ name: "duration", type: speechTypes.duration }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@narratage/estimate/estimate-speech",
      digest: estimateSpeechImplementationDigest,
    },
  }],
};

export const estimateManifestDigest = digestOf(estimateManifest);
export { speechEstimatePolicySchema };
