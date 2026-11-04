import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";
import { assertFrameSpan } from "@hypit/temporal";
import type { StillVideoLayout, StillVideoRequest, StillVideoSegment } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

export function verifyStillVideoLayout(value: unknown): asserts value is StillVideoLayout {
  const layout = object(value, "StillVideoLayout");
  assert(Array.isArray(layout.weights) && layout.weights.length > 0, "StillVideoLayout needs at least one weight");
  for (const weight of layout.weights) {
    assert(typeof weight === "number" && Number.isFinite(weight) && weight > 0,
      "StillVideoLayout weights must be positive");
  }
}
export function sealStillVideoLayout(value: StillVideoLayout): StillVideoLayout {
  const result = canonicalize(value) as unknown as StillVideoLayout;
  verifyStillVideoLayout(result);
  return result;
}

/** Allocate whole frames by largest remainder, after reserving one frame per picture. */
export function planStillVideoSegments(frameCount: number, weights: readonly number[]): readonly StillVideoSegment[] {
  assert(Number.isSafeInteger(frameCount) && frameCount > 0, "Still video frame count must be positive");
  assert(weights.length > 0, "Still video needs at least one picture");
  assert(frameCount >= weights.length,
    `Still video has ${frameCount} frames for ${weights.length} pictures; each picture needs at least one`);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shared = frameCount - weights.length;
  const exact = weights.map((weight) => shared * weight / total);
  const counts = exact.map((share) => 1 + Math.floor(share));
  let remaining = frameCount - counts.reduce((sum, count) => sum + count, 0);
  const order = exact.map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const { index } of order) {
    if (remaining === 0) break;
    counts[index] = counts[index]! + 1;
    remaining -= 1;
  }
  const segments: StillVideoSegment[] = [];
  let start = 0;
  for (const count of counts) {
    segments.push({ startFrame: start, endFrameExclusive: start + count });
    start += count;
  }
  return segments;
}

export function verifyStillVideoRequest(value: unknown): asserts value is StillVideoRequest {
  const request = object(value, "StillVideoRequest");
  const frameRate = object(request.frameRate, "StillVideoRequest.frameRate");
  assert(Number.isSafeInteger(frameRate.numerator) && (frameRate.numerator as number) > 0
    && Number.isSafeInteger(frameRate.denominator) && (frameRate.denominator as number) > 0,
  "StillVideoRequest.frameRate must be a positive rational");
  assert(Number.isSafeInteger(request.frameCount) && (request.frameCount as number) > 0,
    "StillVideoRequest.frameCount must be positive");
  assert(Array.isArray(request.segments) && request.segments.length > 0,
    "StillVideoRequest needs at least one segment");
  let cursor = 0;
  for (const item of request.segments) {
    object(item, "StillVideoRequest.segments[]");
    const segment = item as StillVideoSegment;
    assertFrameSpan(segment);
    assert(segment.startFrame === cursor, "StillVideoRequest segments must be contiguous from frame 0");
    cursor = segment.endFrameExclusive;
    if (segment.source !== undefined) {
      const source = object(segment.source, "StillVideoRequest.segments[].source");
      assert(source.kind === "blob" && typeof source.mediaType === "string" && source.mediaType.startsWith("image/"),
        "StillVideoRequest segment source must be an image Blob");
    }
  }
  assert(cursor === request.frameCount, "StillVideoRequest segments must cover exactly frameCount frames");
}
export function sealStillVideoRequest(value: StillVideoRequest): StillVideoRequest {
  const result = canonicalize(value) as unknown as StillVideoRequest;
  verifyStillVideoRequest(result);
  return result;
}

export function bindStillVideoSource(request: StillVideoRequest, source: BlobRef): StillVideoRequest {
  verifyStillVideoRequest(request);
  assert(source.kind === "blob" && source.mediaType.startsWith("image/"),
    "Still video source must be an image Blob");
  const index = request.segments.findIndex((segment) => segment.source === undefined);
  assert(index >= 0, "Still video already has a picture for every segment");
  return sealStillVideoRequest({
    ...request,
    segments: request.segments.map((segment, at) => at === index ? { ...segment, source } : segment),
  });
}
