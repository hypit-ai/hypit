import { digestOf } from "@narratage/protocol";
import type { Digest, ModuleManifest, TypeRef, ValueSchema } from "@narratage/protocol";

export const promptKitModuleRef = { name: "@narratage/prompt-kit", version: "1" } as const;
export const promptKitTypes = {
  spec: { module: promptKitModuleRef, name: "PromptKitSpec" },
  invocation: { module: promptKitModuleRef, name: "PromptKitInvocation" },
  program: { module: promptKitModuleRef, name: "PromptProgram" },
} satisfies Record<string, TypeRef>;
export const promptKitImplementationDigests = {
  svsFrontend: digestOf("@narratage/prompt-kit/svs-frontend@1"),
  specValidator: digestOf("@narratage/prompt-kit/validate-spec@1"),
  invocationValidator: digestOf("@narratage/prompt-kit/validate-invocation@1"),
  programValidator: digestOf("@narratage/prompt-kit/validate-program@1"),
} as const;

const openObject: ValueSchema = { kind: "object", fields: {}, allowUnknown: true };
const block: ValueSchema = { kind: "object", fields: {}, allowUnknown: true };
const specSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.prompt-kit-spec@1" } },
    id: { schema: { kind: "string", minLength: 1 } },
    separator: { schema: { kind: "literal", value: "\n\n" } },
    defaults: { schema: openObject },
    blocks: { schema: { kind: "array", minItems: 1, items: block } },
  },
};
const invocationSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.prompt-kit-invocation@1" } },
    parameters: { schema: openObject },
    selectors: { schema: openObject },
    slots: { schema: openObject },
  },
};
const programSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.prompt-program@1" } },
    separator: { schema: { kind: "literal", value: "\n\n" } },
    blocks: { schema: { kind: "array", minItems: 1, items: block } },
  },
};

function validatedType(name: string, schema: ValueSchema, locator: string, validatorDigest: Digest) {
  return {
    name,
    schema,
    validator: {
      abi: "svml.type-validator@1" as const,
      implementation: { kind: "registered" as const, locator, digest: validatorDigest },
    },
  };
}

export const promptKitManifest: ModuleManifest = {
  format: "svml.module@1",
  name: promptKitModuleRef.name,
  version: promptKitModuleRef.version,
  dependencies: [],
  types: [
    validatedType(promptKitTypes.spec.name, specSchema, "@narratage/prompt-kit/validate-spec", promptKitImplementationDigests.specValidator),
    validatedType(promptKitTypes.invocation.name, invocationSchema, "@narratage/prompt-kit/validate-invocation", promptKitImplementationDigests.invocationValidator),
    validatedType(promptKitTypes.program.name, programSchema, "@narratage/prompt-kit/validate-program", promptKitImplementationDigests.programValidator),
  ],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const promptKitManifestDigest = digestOf(promptKitManifest);
