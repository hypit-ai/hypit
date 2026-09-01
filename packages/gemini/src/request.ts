import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

export type GeminiMediaPart = { readonly artifact: BlobRef };
export type GeminiRequest = {
  readonly instruction: string;
  readonly prompt: string;
  readonly media: readonly GeminiMediaPart[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

export function verifyGeminiRequest(value: unknown): asserts value is GeminiRequest {
  const request = object(value, "Gemini request");
  assert(typeof request.instruction === "string" && request.instruction.trim().length > 0,
    "Gemini request instruction must be non-empty text");
  assert(typeof request.prompt === "string" && request.prompt.trim().length > 0,
    "Gemini request prompt must be non-empty text");
  assert(Array.isArray(request.media), "Gemini request media must be an array");
  for (const [index, raw] of request.media.entries()) {
    const item = object(raw, `Gemini request media[${index}]`);
    const artifact = object(item.artifact, `Gemini request media[${index}].artifact`);
    assert(artifact.kind === "blob" && typeof artifact.resource === "string"
      && typeof artifact.size === "number" && Number.isSafeInteger(artifact.size)
      && typeof artifact.mediaType === "string",
    `Gemini request media[${index}].artifact must be a BlobRef`);
    assert(/^(?:image|video|audio)\//u.test(artifact.mediaType),
      `Gemini request media[${index}] must be image, video or audio media`);
  }
}

export function sealGeminiRequest(value: GeminiRequest): GeminiRequest {
  const result = canonicalize(value) as unknown as GeminiRequest;
  verifyGeminiRequest(result);
  return result;
}
