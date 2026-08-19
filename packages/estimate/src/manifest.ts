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
    vocabulary: {
      summary: "Estimates the SpeechDuration of a Text from language-aware pronunciation units and an explicit delivery policy, without calling a Provider.",
      attributes: [
        {
          name: "id",
          kind: "identifier",
          required: true,
          summary: "Names the estimate that the published duration and policy bindings are addressed under.",
        },
        {
          name: "source",
          kind: "reference",
          required: true,
          summary: "Selects the Text whose pronunciation units are counted.",
          accepts: [textTypes.text],
        },
        {
          name: "policy",
          kind: "reference",
          required: false,
          summary: "Selects an SVS Recipe carrying the whole policy, in place of the inline parameters.",
          accepts: [svsRecipeType],
          recipe: [
            {
              name: "language",
              required: true,
              summary: "Selects the counting rules the Text is read with, or detects them from the Text.",
              values: ["auto", "en", "zh", "ja", "es"],
            },
            {
              name: "pace",
              required: false,
              summary: "Selects a named delivery density for the chosen language.",
              values: ["slow", "normal", "fast"],
            },
            {
              name: "rate",
              required: false,
              summary: "Sets the delivery density in pronunciation units per second, in place of pace.",
            },
            {
              name: "min",
              required: true,
              summary: "Sets the shortest duration in seconds the estimate may report.",
            },
            {
              name: "max",
              required: true,
              summary: "Sets the longest duration in seconds the estimate may report.",
            },
            {
              name: "rounding",
              required: true,
              summary: "Selects how the bounded duration is rounded to a whole second.",
              values: ["none", "round", "ceil"],
            },
          ],
        },
        {
          name: "language",
          kind: "literal",
          required: false,
          summary: "Selects the counting rules the Text is read with, or detects them from the Text.",
          values: ["auto", "en", "zh", "ja", "es"],
        },
        {
          name: "pace",
          kind: "literal",
          required: false,
          summary: "Selects a named delivery density for the chosen language.",
          values: ["slow", "normal", "fast"],
        },
        {
          name: "rate",
          kind: "literal",
          required: false,
          summary: "Sets the delivery density in pronunciation units per second, in place of pace.",
        },
        {
          name: "min",
          kind: "literal",
          required: false,
          summary: "Sets the shortest duration in seconds the estimate may report.",
        },
        {
          name: "max",
          kind: "literal",
          required: false,
          summary: "Sets the longest duration in seconds the estimate may report.",
        },
        {
          name: "rounding",
          kind: "literal",
          required: false,
          summary: "Selects how the bounded duration is rounded to a whole second.",
          values: ["none", "round", "ceil"],
        },
      ],
      ports: [{
        name: "duration",
        type: speechTypes.duration,
        summary: "The estimated duration in seconds of speaking the source Text.",
      }],
      example: `<estimate:Speech
  id="opening-duration"
  source={story.segment.opening.speech}
  language="en"
  pace="normal"
  min="4"
  max="15"
  rounding="round"
/>`,
      notes: [
        "Either policy or the inline parameters, never both. The inline form requires language, min, max, rounding and exactly one of pace or rate; the Recipe behind policy carries those same properties.",
        "The Recipe behind policy rejects any property outside language, pace, rate, min, max and rounding, and requires exactly one of pace or rate. Nothing is optional beyond that choice: the Recipe supplies every value itself.",
        "The resolved policy is sealed into a SpeechEstimatePolicy Record published as `<id>.policy`.",
        "The element must be empty.",
      ],
    },
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
