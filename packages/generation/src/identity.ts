import {
  canonicalize,
  digestOf,
  isDigest,
} from "@svml/protocol";
import type { BlobRef, CanonicalValue, Digest } from "@svml/protocol";

import type {
  GeneratedImageSet,
  GeneratedImageSetContent,
  GeneratedVideoSet,
  GeneratedVideoSetContent,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function plainObject(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

export function assertGenerationBlobRef(
  value: unknown,
  mediaPrefix?: "image/" | "video/" | "audio/",
): asserts value is BlobRef {
  const object = plainObject(value, "Generation artifact");
  assert(object.kind === "blob", "Generation artifact must be a BlobRef");
  assert(typeof object.digest === "string" && isDigest(object.digest), "Generation artifact digest is invalid");
  assert(Number.isSafeInteger(object.size) && (object.size as number) >= 0, "Generation artifact size is invalid");
  assert(typeof object.mediaType === "string" && object.mediaType.length > 0, "Generation artifact mediaType is invalid");
  if (mediaPrefix !== undefined) {
    assert(object.mediaType.startsWith(mediaPrefix), `Generation artifact must have ${mediaPrefix} media`);
  }
}

/** Content identity used by every exact model request Type. */
export function sealGenerationRequest<T extends object>(
  content: T,
): T & { readonly requestDigest: Digest } {
  const normalized = canonicalize(content) as unknown as T;
  return { ...normalized, requestDigest: digestOf(normalized) };
}

export function verifyGenerationRequestDigest(value: unknown): asserts value is Record<string, CanonicalValue> & {
  readonly requestDigest: Digest;
} {
  const object = plainObject(value, "Generation request");
  const requestDigest = object.requestDigest;
  assert(typeof requestDigest === "string" && isDigest(requestDigest), "Generation request digest is invalid");
  const { requestDigest: _requestDigest, ...content } = object;
  assert(requestDigest === digestOf(content), "Generation request digest differs from its canonical contents");
}

export function sealGeneratedImageSet(content: GeneratedImageSetContent): GeneratedImageSet {
  assert(content.contract === "svml.generated-image-set@1", "Generated image contract is invalid");
  assert(content.images.length > 0, "Generated image set is empty");
  content.images.forEach((artifact) => assertGenerationBlobRef(artifact, "image/"));
  const normalized = canonicalize(content) as unknown as GeneratedImageSetContent;
  return { ...normalized, resultDigest: digestOf(normalized) };
}

export function verifyGeneratedImageSet(value: unknown): asserts value is GeneratedImageSet {
  const object = plainObject(value, "Generated image set") as unknown as GeneratedImageSet;
  assert(object.contract === "svml.generated-image-set@1", "Generated image contract is invalid");
  assert(Array.isArray(object.images) && object.images.length > 0, "Generated image set is empty");
  object.images.forEach((artifact) => assertGenerationBlobRef(artifact, "image/"));
  const { resultDigest, ...content } = object;
  assert(isDigest(resultDigest) && resultDigest === digestOf(content), "Generated image result digest differs");
}

export function sealGeneratedVideoSet(content: GeneratedVideoSetContent): GeneratedVideoSet {
  assert(content.contract === "svml.generated-video-set@1", "Generated video contract is invalid");
  assert(content.videos.length > 0, "Generated video set is empty");
  content.videos.forEach((artifact) => assertGenerationBlobRef(artifact, "video/"));
  const normalized = canonicalize(content) as unknown as GeneratedVideoSetContent;
  return { ...normalized, resultDigest: digestOf(normalized) };
}

export function verifyGeneratedVideoSet(value: unknown): asserts value is GeneratedVideoSet {
  const object = plainObject(value, "Generated video set") as unknown as GeneratedVideoSet;
  assert(object.contract === "svml.generated-video-set@1", "Generated video contract is invalid");
  assert(Array.isArray(object.videos) && object.videos.length > 0, "Generated video set is empty");
  object.videos.forEach((artifact) => assertGenerationBlobRef(artifact, "video/"));
  const { resultDigest, ...content } = object;
  assert(isDigest(resultDigest) && resultDigest === digestOf(content), "Generated video result digest differs");
}
