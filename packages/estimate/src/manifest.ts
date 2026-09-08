import type { ModuleManifest, TypeRef, ValueSchema } from "@hypit/protocol";

export const estimateModuleRef = { name: "@hypit/estimate", version: "1" } as const;

/**
 * The one graph value this package still declares: the delivery policy an estimated SemanticTake
 * weights its Tokens with. Durations themselves are author literals; measuring a script happens at
 * creation time with `hypit measure`, never inside a Build.
 */
export const estimateTypes = {
  speechPolicy: { module: estimateModuleRef, name: "SpeechEstimatePolicy" },
} satisfies Record<string, TypeRef>;

const number = { kind: "number" } as const satisfies ValueSchema;
export const speechEstimatePolicySchema: ValueSchema = {
  kind: "object",
  fields: {
    language: { schema: { kind: "string", enum: ["auto", "en", "zh", "ja", "es"] } },
    pace: { schema: { kind: "string", enum: ["slow", "normal", "fast"] }, optional: true },
    rate: { schema: { kind: "number", minimum: 0.000001 }, optional: true },
    rounding: { schema: { kind: "string", enum: ["none", "round", "ceil"] } },
    paddingSec: { schema: number, optional: true },
  },
};

export const estimateManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: estimateModuleRef.name,
  version: estimateModuleRef.version,
  dependencies: [],
  types: [{ name: estimateTypes.speechPolicy.name }],
  capabilities: [],
  producers: [],
};
