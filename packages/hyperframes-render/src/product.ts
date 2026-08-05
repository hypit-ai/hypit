import { isDigest } from "@svml/protocol";
import { digestOf } from "@svml/protocol";
import type { CanonicalValue, Digest } from "@svml/protocol";
import { assertHyperframesDocument } from "@svml/hyperframes";
import type { HyperframesDocument } from "@svml/hyperframes";

import type { HyperframesRenderedVideo } from "./types.js";

export const requestHyperframesRenderImplementationDigest = digestOf("@svml/hyperframes-render/request@2");
export const projectHyperframesVideoImplementationDigest = digestOf("@svml/hyperframes-render/project-video@2");

function content(
  value: Omit<HyperframesRenderedVideo, "digest">,
): Omit<HyperframesRenderedVideo, "digest"> {
  return {
    contract: "svml.hyperframes-rendered-video@2",
    documentDigest: value.documentDigest,
    programSpaceDigest: value.programSpaceDigest,
    frameRate: { ...value.frameRate },
    frameCount: value.frameCount,
    canvas: { ...value.canvas },
    artifact: { ...value.artifact },
  };
}

export function computeHyperframesRenderedVideoDigest(
  value: Omit<HyperframesRenderedVideo, "digest">,
): Digest {
  return digestOf(content(value));
}

export function sealHyperframesRenderedVideo(
  value: Omit<HyperframesRenderedVideo, "digest">,
): HyperframesRenderedVideo {
  const normalized = content(value);
  return { ...normalized, digest: digestOf(normalized) };
}

export function assertHyperframesRenderedVideo(value: HyperframesRenderedVideo): void {
  if (value.contract !== "svml.hyperframes-rendered-video@2") {
    throw new Error("Unsupported HyperframesRenderedVideo contract.");
  }
  if (
    !isDigest(value.documentDigest)
    || !isDigest(value.programSpaceDigest)
    || !isDigest(value.artifact.digest)
  ) {
    throw new Error("HyperframesRenderedVideo contains an invalid digest.");
  }
  if (
    !Number.isSafeInteger(value.frameRate.numerator)
    || value.frameRate.numerator <= 0
    || !Number.isSafeInteger(value.frameRate.denominator)
    || value.frameRate.denominator <= 0
    || !Number.isSafeInteger(value.frameCount)
    || value.frameCount <= 0
    || !Number.isSafeInteger(value.canvas.width)
    || value.canvas.width <= 0
    || !Number.isSafeInteger(value.canvas.height)
    || value.canvas.height <= 0
  ) {
    throw new Error("HyperframesRenderedVideo frame domain or canvas is invalid.");
  }
  const durationSec = value.frameCount * value.frameRate.denominator / value.frameRate.numerator;
  const durationTolerance = Math.max(1e-7, durationSec * Number.EPSILON * 8);
  if (
    value.artifact.size < 0
    || !Number.isFinite(value.artifact.durationSec)
    || Math.abs(value.artifact.durationSec - durationSec) > durationTolerance
    || !value.artifact.mediaType.startsWith("video/")
  ) {
    throw new Error("HyperframesRenderedVideo artifact is invalid.");
  }
  const { digest: _digest, ...draft } = value;
  if (!isDigest(value.digest) || value.digest !== computeHyperframesRenderedVideoDigest(draft)) {
    throw new Error("HyperframesRenderedVideo digest does not match its contents.");
  }
}

export function hyperframesRenderRequest(document: HyperframesDocument): CanonicalValue {
  assertHyperframesDocument(document);
  return {
    contract: "svml.hyperframes-render-request@2",
    document,
  };
}

export function projectHyperframesVideo(value: HyperframesRenderedVideo) {
  assertHyperframesRenderedVideo(value);
  return { ...value.artifact };
}
