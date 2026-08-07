import {
  assertGenerationBlobRef,
  generationBlobRefSchema,
  generationObjectSchema,
  generationPromptSchema,
  sealGenerationRequest,
} from "@svml/generation";
import { defineExactModelModule } from "@svml/model-kit";
import type { BlobRef, ValueSchema } from "@svml/protocol";

export const minimaxH3ModuleRef = { name: "@svml/minimax-h3", version: "0.0.0-dev" } as const;
export type MinimaxH3Mode = "text" | "frames" | "reference";
export type MinimaxH3Reference =
  | { readonly kind: "image"; readonly artifact: BlobRef }
  | { readonly kind: "video"; readonly artifact: BlobRef }
  | { readonly kind: "audio"; readonly artifact: BlobRef };

type Common = {
  readonly contract: "svml.minimax-h3-request@1";
  readonly model: "minimax-h3";
  readonly prompt: string;
  readonly durationSec: number;
};

export type MinimaxH3TextRequestContent = Common & {
  readonly mode: "text";
  readonly aspectRatio: string;
};
export type MinimaxH3FramesRequestContent = Common & {
  readonly mode: "frames";
  readonly firstFrame: BlobRef;
  readonly lastFrame?: BlobRef;
};
export type MinimaxH3ReferenceRequestContent = Common & {
  readonly mode: "reference";
  readonly references: readonly MinimaxH3Reference[];
  readonly aspectRatio: string;
};
export type MinimaxH3RequestContent =
  | MinimaxH3TextRequestContent
  | MinimaxH3FramesRequestContent
  | MinimaxH3ReferenceRequestContent;
export type MinimaxH3Request = MinimaxH3RequestContent;

const commonFields = {
  contract: { schema: { kind: "literal", value: "svml.minimax-h3-request@1" } },
  model: { schema: { kind: "literal", value: "minimax-h3" } },
  prompt: { schema: generationPromptSchema },
  durationSec: { schema: { kind: "number", integer: true, minimum: 1, maximum: 60 } },
} as const;
const aspect = { kind: "string", minLength: 3, maxLength: 16 } as const satisfies ValueSchema;
const referenceSchema: ValueSchema = {
  kind: "oneOf",
  variants: (["image", "video", "audio"] as const).map((kind) => generationObjectSchema({
    kind: { schema: { kind: "literal", value: kind } },
    artifact: { schema: generationBlobRefSchema },
  })),
};

const schemas: Record<MinimaxH3Mode, ValueSchema> = {
  text: generationObjectSchema({
    ...commonFields,
    mode: { schema: { kind: "literal", value: "text" } },
    aspectRatio: { schema: aspect },
  }),
  frames: generationObjectSchema({
    ...commonFields,
    mode: { schema: { kind: "literal", value: "frames" } },
    firstFrame: { schema: generationBlobRefSchema },
    lastFrame: { schema: generationBlobRefSchema, optional: true },
  }),
  reference: generationObjectSchema({
    ...commonFields,
    mode: { schema: { kind: "literal", value: "reference" } },
    references: { schema: { kind: "array", minItems: 1, maxItems: 12, items: referenceSchema } },
    aspectRatio: { schema: aspect },
  }),
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} must be an object`);
  return value as Record<string, unknown>;
}

export function verifyMinimaxH3Request(value: unknown, expectedMode?: MinimaxH3Mode): asserts value is MinimaxH3Request {
  const request = object(value, "MiniMax H3 request");
  if (request.contract !== "svml.minimax-h3-request@1" || request.model !== "minimax-h3") {
    throw new Error("MiniMax H3 request identity is invalid");
  }
  if (expectedMode !== undefined && request.mode !== expectedMode) throw new Error(`Expected MiniMax H3 ${expectedMode}`);
  if (request.mode === "frames") {
    assertGenerationBlobRef(request.firstFrame, "image/");
    if (request.lastFrame !== undefined) assertGenerationBlobRef(request.lastFrame, "image/");
  } else if (request.mode === "reference") {
    if (!Array.isArray(request.references) || request.references.length === 0) throw new Error("MiniMax H3 references are empty");
    request.references.forEach((candidate) => {
      const item = object(candidate, "MiniMax H3 reference");
      if (item.kind !== "image" && item.kind !== "video" && item.kind !== "audio") {
        throw new Error("MiniMax H3 reference kind is invalid");
      }
      assertGenerationBlobRef(item.artifact, `${item.kind}/` as "image/" | "video/" | "audio/");
    });
  } else if (request.mode !== "text") {
    throw new Error("MiniMax H3 mode is invalid");
  }
}

export function sealMinimaxH3Request<T extends MinimaxH3RequestContent>(
  content: T,
): T {
  const request = sealGenerationRequest(content);
  verifyMinimaxH3Request(request, content.mode);
  return request;
}

export const minimaxH3Definition = defineExactModelModule({
  module: minimaxH3ModuleRef,
  endpoints: (["text", "frames", "reference"] as const).map((mode) => ({
    key: mode,
    requestTypeName: `MinimaxH3${mode[0]!.toUpperCase()}${mode.slice(1)}Request`,
    capabilityName: `minimax-h3-${mode}-generation`,
    producerName: `request-minimax-h3-${mode}`,
    result: "video" as const,
    requestSchema: schemas[mode],
    verifyRequest: (value: unknown) => verifyMinimaxH3Request(value, mode),
  })),
});

export const minimaxH3Manifest = minimaxH3Definition.manifest;
export const minimaxH3ManifestDigest = minimaxH3Definition.manifestDigest;
export const minimaxH3Endpoints = minimaxH3Definition.endpoints;
export const minimaxH3Component = minimaxH3Definition.component;
