import {
  canonicalize,
  isDigest,
} from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

import type {
  GeneratedAudioSet,
  GeneratedAudioSetContent,
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

/** Canonical request value; Core supplies the enclosing Need identity. */
export function sealGenerationRequest<T extends object>(
  content: T,
): T {
  return canonicalize(content) as unknown as T;
}

export function sealGeneratedImageSet(content: GeneratedImageSetContent): GeneratedImageSet {
  assert(content.images.length > 0, "Generated image set is empty");
  content.images.forEach((artifact) => assertGenerationBlobRef(artifact, "image/"));
  return canonicalize(content) as unknown as GeneratedImageSet;
}

export function verifyGeneratedImageSet(value: unknown): asserts value is GeneratedImageSet {
  const object = plainObject(value, "Generated image set") as unknown as GeneratedImageSet;
  assert(Array.isArray(object.images) && object.images.length > 0, "Generated image set is empty");
  object.images.forEach((artifact) => assertGenerationBlobRef(artifact, "image/"));
}

export function sealGeneratedVideoSet(content: GeneratedVideoSetContent): GeneratedVideoSet {
  assert(content.videos.length > 0, "Generated video set is empty");
  content.videos.forEach((artifact) => assertGenerationBlobRef(artifact, "video/"));
  return canonicalize(content) as unknown as GeneratedVideoSet;
}

export function verifyGeneratedVideoSet(value: unknown): asserts value is GeneratedVideoSet {
  const object = plainObject(value, "Generated video set") as unknown as GeneratedVideoSet;
  assert(Array.isArray(object.videos) && object.videos.length > 0, "Generated video set is empty");
  object.videos.forEach((artifact) => assertGenerationBlobRef(artifact, "video/"));
}

export function sealGeneratedAudioSet(content: GeneratedAudioSetContent): GeneratedAudioSet {
  assert(content.audios.length > 0, "Generated audio set is empty");
  content.audios.forEach((artifact) => assertGenerationBlobRef(artifact, "audio/"));
  return canonicalize(content) as unknown as GeneratedAudioSet;
}

export function verifyGeneratedAudioSet(value: unknown): asserts value is GeneratedAudioSet {
  const object = plainObject(value, "Generated audio set") as unknown as GeneratedAudioSet;
  assert(Array.isArray(object.audios) && object.audios.length > 0, "Generated audio set is empty");
  object.audios.forEach((artifact) => assertGenerationBlobRef(artifact, "audio/"));
}
