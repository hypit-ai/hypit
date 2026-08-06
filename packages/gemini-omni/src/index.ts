import {
  assertGenerationBlobRef,
  generationBlobRefSchema,
  generationDigestSchema,
  generationObjectSchema,
  generationPromptSchema,
  sealGenerationRequest,
  verifyGenerationRequestDigest,
} from "@svml/generation";
import { defineExactModelModule } from "@svml/model-kit";
import type { BlobRef, Digest, ValueSchema } from "@svml/protocol";

export const geminiOmniModuleRef = { name: "@svml/gemini-omni", version: "0.0.0-dev" } as const;

export type GeminiOmniVideoReference = {
  readonly artifact: BlobRef;
  readonly startSec: number;
  readonly endSec: number;
};

export type GeminiOmniRequestContent = {
  readonly contract: "svml.gemini-omni-request@1";
  readonly model: "gemini-omni-video";
  readonly prompt: string;
  readonly durationSec: 4 | 6 | 8 | 10;
  readonly aspectRatio: "16:9" | "9:16";
  readonly resolution: "720p" | "1080p" | "4k";
  readonly seed?: number;
  readonly images?: readonly BlobRef[];
  /** KIE Gemini Omni opaque audio assets; ordinary audio BlobRefs are deliberately not disguised as these IDs. */
  readonly audioIds?: readonly string[];
  readonly videos?: readonly GeminiOmniVideoReference[];
  readonly characterIds?: readonly string[];
};
export type GeminiOmniRequest = GeminiOmniRequestContent & { readonly requestDigest: Digest };

const idSchema = { kind: "string", minLength: 1, maxLength: 255 } as const satisfies ValueSchema;
export const geminiOmniRequestSchema = generationObjectSchema({
  contract: { schema: { kind: "literal", value: "svml.gemini-omni-request@1" } },
  model: { schema: { kind: "literal", value: "gemini-omni-video" } },
  prompt: { schema: generationPromptSchema },
  durationSec: {
    schema: {
      kind: "oneOf",
      variants: [4, 6, 8, 10].map((value) => ({ kind: "literal" as const, value })),
    },
  },
  aspectRatio: { schema: { kind: "string", enum: ["16:9", "9:16"] } },
  resolution: { schema: { kind: "string", enum: ["720p", "1080p", "4k"] } },
  seed: { schema: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 }, optional: true },
  images: {
    schema: { kind: "array", minItems: 1, maxItems: 7, items: generationBlobRefSchema },
    optional: true,
  },
  audioIds: { schema: { kind: "array", minItems: 1, maxItems: 1, items: idSchema }, optional: true },
  videos: {
    schema: {
      kind: "array",
      minItems: 1,
      maxItems: 1,
      items: generationObjectSchema({
        artifact: { schema: generationBlobRefSchema },
        startSec: { schema: { kind: "number", minimum: 0 } },
        endSec: { schema: { kind: "number", minimum: 0 } },
      }),
    },
    optional: true,
  },
  characterIds: { schema: { kind: "array", minItems: 1, maxItems: 3, items: idSchema }, optional: true },
  requestDigest: { schema: generationDigestSchema },
});

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} must be an object`);
  return value as Record<string, unknown>;
}

export function verifyGeminiOmniRequest(value: unknown): asserts value is GeminiOmniRequest {
  verifyGenerationRequestDigest(value);
  const request = object(value, "Gemini Omni request");
  if (request.contract !== "svml.gemini-omni-request@1" || request.model !== "gemini-omni-video") {
    throw new Error("Gemini Omni request identity is invalid");
  }
  if (![4, 6, 8, 10].includes(request.durationSec as number)
    || (request.aspectRatio !== "16:9" && request.aspectRatio !== "9:16")
    || (request.resolution !== "720p" && request.resolution !== "1080p" && request.resolution !== "4k")) {
    throw new Error("Gemini Omni output parameters are invalid");
  }
  if (request.seed !== undefined
    && (typeof request.seed !== "number" || !Number.isSafeInteger(request.seed)
      || request.seed < 0 || request.seed > 2_147_483_647)) {
    throw new Error("Gemini Omni seed is invalid");
  }
  const images = request.images === undefined ? [] : request.images;
  const videos = request.videos === undefined ? [] : request.videos;
  const characters = request.characterIds === undefined ? [] : request.characterIds;
  const audios = request.audioIds === undefined ? [] : request.audioIds;
  if (!Array.isArray(images) || !Array.isArray(videos) || !Array.isArray(characters) || !Array.isArray(audios)) {
    throw new Error("Gemini Omni references are invalid");
  }
  if (audios.length > 1 || audios.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("Gemini Omni accepts at most one opaque audio ID");
  }
  images.forEach((image) => assertGenerationBlobRef(image, "image/"));
  videos.forEach((candidate) => {
    const video = object(candidate, "Gemini Omni video reference");
    assertGenerationBlobRef(video.artifact, "video/");
    if (typeof video.startSec !== "number" || typeof video.endSec !== "number" || video.endSec <= video.startSec) {
      throw new Error("Gemini Omni video range must have endSec > startSec");
    }
  });
  const quota = images.length + videos.length * 2 + characters.length;
  if (quota > 7) throw new Error(`Gemini Omni reference quota is ${quota}, over 7`);
}

export function sealGeminiOmniRequest(content: GeminiOmniRequestContent): GeminiOmniRequest {
  const request = sealGenerationRequest(content);
  verifyGeminiOmniRequest(request);
  return request;
}

export const geminiOmniDefinition = defineExactModelModule({
  module: geminiOmniModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "GeminiOmniVideoRequest",
    capabilityName: "gemini-omni-video-generation",
    producerName: "request-gemini-omni-video",
    result: "video",
    requestSchema: geminiOmniRequestSchema,
    verifyRequest: verifyGeminiOmniRequest,
  }],
});

export const geminiOmniManifest = geminiOmniDefinition.manifest;
export const geminiOmniManifestDigest = geminiOmniDefinition.manifestDigest;
export const geminiOmniEndpoints = geminiOmniDefinition.endpoints;
export const geminiOmniComponent = geminiOmniDefinition.component;
