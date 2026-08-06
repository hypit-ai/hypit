import { captionManifest, captionModuleRef, captionTypes } from "@svml/caption";
import { contractTypes, videoContractDependencies } from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

export const captionGeminiModuleRef = { name: "@svml/caption-gemini", version: "0.0.0-dev" } as const;
export const captionGeminiTypes = {
  program: { module: captionGeminiModuleRef, name: "CaptionGeminiProgram" },
  request: { module: captionGeminiModuleRef, name: "CaptionGeminiRequest" },
} satisfies Record<string, TypeRef>;
export const captionGeminiCapabilities = {
  plan: { module: captionGeminiModuleRef, name: "gemini-caption-planning" },
} satisfies Record<string, CapabilityRef>;
export const captionGeminiProducers = {
  compile: { module: captionGeminiModuleRef, name: "compile-caption-gemini-request" },
  request: { module: captionGeminiModuleRef, name: "request-caption-gemini-plan" },
} satisfies Record<string, ProducerRef>;
export const captionGeminiImplementationDigests = {
  compile: digestOf("@svml/caption-gemini/compile-request@2"),
  request: digestOf("@svml/caption-gemini/request-plan@2"),
  programValidator: digestOf("@svml/caption-gemini/validate-program@2"),
  requestValidator: digestOf("@svml/caption-gemini/validate-request@2"),
  plannerSurface: digestOf("@svml/caption-gemini/planner-surface@2"),
} as const;

const string = { kind: "string", minLength: 1 } as const satisfies ValueSchema;
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const satisfies ValueSchema;
const nonNegativeInteger = { kind: "number", integer: true, minimum: 0 } as const satisfies ValueSchema;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
): ValueSchema => ({ kind: "object", fields });
const model = { kind: "string", enum: ["gemini-2.5-flash", "gemini-3.1-pro-preview"] } as const satisfies ValueSchema;
const fieldValueSchema: ValueSchema = {
  kind: "oneOf",
  variants: [
    object({ kind: { schema: { kind: "literal", value: "boolean" } } }),
    object({
      kind: { schema: { kind: "literal", value: "enum" } },
      values: { schema: { kind: "array", minItems: 1, items: string } },
    }),
    object({
      kind: { schema: { kind: "literal", value: "number" } },
      minimum: { schema: { kind: "number" }, optional: true },
      maximum: { schema: { kind: "number" }, optional: true },
    }),
  ],
};
const fieldDeclaration = object({
  id: { schema: string }, value: { schema: fieldValueSchema }, instruction: { schema: string },
  minimumPerCue: { schema: nonNegativeInteger }, maximumPerCue: { schema: nonNegativeInteger },
});
const planningRun = object({
  id: { schema: string }, styleId: { schema: string },
  atomIds: { schema: { kind: "array", minItems: 1, items: string } },
  cueInstruction: { schema: string }, fields: { schema: { kind: "array", items: fieldDeclaration } },
});
export const captionGeminiProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-gemini-program@1" } },
  model: { schema: model }, programDigest: { schema: digest },
});
export const captionGeminiRequestSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-gemini-request@1" } },
  model: { schema: model }, narrativeDigest: { schema: digest }, captionProgramDigest: { schema: digest },
  atoms: { schema: { kind: "array", minItems: 1, items: object({ id: { schema: string }, text: { schema: string } }) } },
  runs: { schema: { kind: "array", minItems: 1, items: planningRun } },
  systemInstruction: { schema: string }, prompt: { schema: string },
  temperature: { schema: { kind: "literal", value: 0.2 } }, requestDigest: { schema: digest },
});

function ownedType(name: string, schema: ValueSchema, digestValue: ReturnType<typeof digestOf>) {
  return {
    name,
    schema,
    validator: {
      abi: "svml.type-validator@1" as const,
      implementation: { kind: "registered" as const, locator: `@svml/caption-gemini/validate-${name}`, digest: digestValue },
    },
  };
}

export const captionGeminiManifest: ModuleManifest = {
  format: "svml.module@0",
  name: captionGeminiModuleRef.name,
  version: captionGeminiModuleRef.version,
  dependencies: [
    videoContractDependencies.narrative,
    { module: captionModuleRef, digest: digestOf(captionManifest) },
  ],
  types: [
    ownedType(captionGeminiTypes.program.name, captionGeminiProgramSchema, captionGeminiImplementationDigests.programValidator),
    ownedType(captionGeminiTypes.request.name, captionGeminiRequestSchema, captionGeminiImplementationDigests.requestValidator),
  ],
  capabilities: [{ name: captionGeminiCapabilities.plan.name, returns: captionTypes.plan }],
  surfaces: [{
    name: "planner",
    tag: "Planner",
    mode: "structured",
    outputs: [captionGeminiTypes.program, captionTypes.plan],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@svml/caption-gemini/planner-surface",
      digest: captionGeminiImplementationDigests.plannerSurface,
    },
  }],
  producers: [
    {
      name: captionGeminiProducers.compile.name,
      inputs: [
        { name: "narrative", type: contractTypes.narrative },
        { name: "captionProgram", type: captionTypes.program },
        { name: "program", type: captionGeminiTypes.program },
      ],
      outputs: [{ name: "request", type: captionGeminiTypes.request }],
      needs: [],
      implementation: {
        kind: "registered", locator: "@svml/caption-gemini/compile-request", digest: captionGeminiImplementationDigests.compile,
      },
    },
    {
      name: captionGeminiProducers.request.name,
      inputs: [{ name: "request", type: captionGeminiTypes.request }],
      outputs: [],
      needs: [{
        name: "plan", capability: captionGeminiCapabilities.plan, returns: captionTypes.plan,
        affinity: [{ resultPointer: "/planningRequestDigest", input: "request", inputPointer: "/requestDigest" }],
      }],
      implementation: {
        kind: "registered", locator: "@svml/caption-gemini/request-plan", digest: captionGeminiImplementationDigests.request,
      },
    },
  ],
};

export const captionGeminiManifestDigest = digestOf(captionGeminiManifest);
