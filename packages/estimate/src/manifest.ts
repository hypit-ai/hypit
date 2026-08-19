import { speechDependency, speechTypes } from "@hypit/speech";
import { textDependency, textTypes } from "@hypit/text";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { svsManifest, svsRecipeType } from "@hypit/svs";

export const estimateModuleRef = { name: "@hypit/estimate", version: "1" } as const;
export const estimateTypes = {
  speechPolicy: { module: estimateModuleRef, name: "SpeechEstimatePolicy" },
} satisfies Record<string, TypeRef>;
export const estimateProducers = {
  speech: { module: estimateModuleRef, name: "estimate-speech-duration" },
} satisfies Record<string, ProducerRef>;

const number = { kind: "number" } as const satisfies ValueSchema;
const speechEstimatePolicySchema: ValueSchema = {
  kind: "object",
  fields: {

    language: { schema: { kind: "string", enum: ["auto", "en", "zh", "ja", "es"] } },
    pace: { schema: { kind: "string", enum: ["slow", "normal", "fast"] }, optional: true },
    rate: { schema: { kind: "number", minimum: 0.000001 }, optional: true },
    minimumSec: { schema: number },
    maximumSec: { schema: number },
    rounding: { schema: { kind: "string", enum: ["none", "round", "ceil"] } },
  },
};

export const estimateMarkupSurfaces = [{
    name: "speech",
    tag: "Speech",
    mode: "structured",
    outputs: [estimateTypes.speechPolicy, speechTypes.duration],
  }] as const;


export const estimateManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: estimateModuleRef.name,
  version: estimateModuleRef.version,
  dependencies: [
    speechDependency,
    textDependency,
    { module: svsRecipeType.module },
  ],
  types: [{ name: estimateTypes.speechPolicy.name }],
  capabilities: [],
  producers: [{
    name: estimateProducers.speech.name,
    inputs: [
      { name: "speech", type: textTypes.text },
      { name: "policy", type: estimateTypes.speechPolicy },
    ],
    outputs: [{ name: "duration", type: speechTypes.duration }],
    needs: [],
  }],
};

export { speechEstimatePolicySchema };
