import { captionManifest, captionModuleRef, captionTypes } from "@narratage/caption";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { digestOf } from "@narratage/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

export const captionGeminiModuleRef = { name: "@narratage/caption-gemini", version: "1" } as const;
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
  compile: digestOf("@narratage/caption-gemini/compile-readable-atoms-structured-fields@1"),
  request: digestOf("@narratage/caption-gemini/request-readable-atoms-plan@1"),
  programValidator: digestOf("@narratage/caption-gemini/validate-program@1"),
  requestValidator: digestOf("@narratage/caption-gemini/validate-readable-atoms-request@1"),
  plannerSurface: digestOf("@narratage/caption-gemini/display-planner-surface@1"),
} as const;

const string = { kind: "string", minLength: 1 } as const satisfies ValueSchema;
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
  atoms: { schema: { kind: "array", minItems: 1, items: object({
    id: { schema: string }, words: { schema: { kind: "array", minItems: 1, items: object({
      id: { schema: string }, text: { schema: string },
    }) } },
  }) } },
  cueMinimumWords: { schema: nonNegativeInteger }, cueMaximumWords: { schema: nonNegativeInteger },
  cueInstruction: { schema: string }, fields: { schema: { kind: "array", items: fieldDeclaration } },
});
export const captionGeminiProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-gemini-program@1" } },
  model: { schema: model },
});
export const captionGeminiRequestSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-gemini-request@1" } },
  model: { schema: model },
  runs: { schema: { kind: "array", minItems: 1, items: planningRun } },
  systemInstruction: { schema: string }, prompt: { schema: string },
  temperature: { schema: { kind: "literal", value: 0.2 } },
});

function ownedType(name: string, schema: ValueSchema, digestValue: ReturnType<typeof digestOf>) {
  return {
    name,
    schema,
    validator: {
      implementation: { digest: digestValue },
    },
  };
}

export const captionGeminiMarkupSurfaces = [{
    name: "planner",
    tag: "Planner",
    mode: "structured",
    outputs: [captionGeminiTypes.program, captionTypes.plan],
    implementation: {
      digest: captionGeminiImplementationDigests.plannerSurface,
    },
  }] as const;


export const captionGeminiManifest: ModuleManifest = {
  format: "svml.module@1",
  name: captionGeminiModuleRef.name,
  version: captionGeminiModuleRef.version,
  dependencies: [
    narrativeDependency,
    { module: captionModuleRef, digest: digestOf(captionManifest) },
  ],
  types: [
    ownedType(captionGeminiTypes.program.name, captionGeminiProgramSchema, captionGeminiImplementationDigests.programValidator),
    ownedType(captionGeminiTypes.request.name, captionGeminiRequestSchema, captionGeminiImplementationDigests.requestValidator),
  ],
  capabilities: [{ name: captionGeminiCapabilities.plan.name, returns: captionTypes.plan }],
  producers: [
    {
      name: captionGeminiProducers.compile.name,
      inputs: [
        { name: "display", type: narrativeTypes.captionDisplay },
        { name: "captionProgram", type: captionTypes.program },
        { name: "program", type: captionGeminiTypes.program },
      ],
      outputs: [{ name: "request", type: captionGeminiTypes.request }],
      needs: [],
      implementation: {
        digest: captionGeminiImplementationDigests.compile,
      },
    },
    {
      name: captionGeminiProducers.request.name,
      inputs: [{ name: "request", type: captionGeminiTypes.request }],
      outputs: [],
      needs: [{ name: "plan", capability: captionGeminiCapabilities.plan, returns: captionTypes.plan }],
      implementation: {
        digest: captionGeminiImplementationDigests.request,
      },
    },
  ],
};

export const captionGeminiManifestDigest = digestOf(captionGeminiManifest);
