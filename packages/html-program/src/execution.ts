import type { CanonicalValue, BlobRef } from "@hypit/hypit/protocol";
import { assertBlobRef } from "@hypit/hypit/protocol";
import { assertFrameSpan } from "@hypit/timeline";
import type { FrameSpan } from "@hypit/timeline";
import { sameOutputPictureSpec, verifyVisualDeliverySpec, verifyOutputPictureSpec } from "@hypit/media";
import type { FrameOutputPictureSpec, VisualDeliverySpec } from "@hypit/media";
import { assertHtmlProgram } from "./document.js";
import type { HtmlProgram } from "./types.js";

export type HtmlRasterRequest = {
  readonly program: HtmlProgram;
  readonly delivery: VisualDeliverySpec;
  readonly range?: FrameSpan;
};

/** Select original program frames in strictly increasing order. */
export type HtmlFrameRequest = {
  readonly program: HtmlProgram;
  readonly picture: FrameOutputPictureSpec;
  readonly frames: readonly number[];
};

/** Self-describing PNG pictures at absolute HtmlProgram frames. */
export type HtmlFrameImages = {
  readonly picture: FrameOutputPictureSpec;
  readonly frames: readonly {
    readonly frame: number;
    readonly artifact: BlobRef;
  }[];
};

function verifyHtmlFramePicture(value: unknown): asserts value is FrameOutputPictureSpec {
  verifyOutputPictureSpec(value);
  if (value.colorTransfer !== "srgb" || value.colorMatrix !== "rgb" || value.colorRange !== "full") {
    throw new Error("HTML frame capture requires an sRGB full-range image interpretation");
  }
}

export function verifyHtmlFrameRequest(value: unknown): asserts value is HtmlFrameRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["program", "picture", "frames"].includes(key))) {
    throw new Error("HTML frame request needs one program, picture requirement and frames");
  }
  const request = value as HtmlFrameRequest;
  assertHtmlProgram(request.program);
  verifyHtmlFramePicture(request.picture);
  if (!Array.isArray(request.frames) || request.frames.length === 0 || request.frames.some((frame, index) =>
    !Number.isSafeInteger(frame) || frame < 0 || frame >= request.program.frameCount
      || (index > 0 && frame <= request.frames[index - 1]!))) {
    throw new Error(`Frames must be strictly increasing integers in [0, ${request.program.frameCount})`);
  }
}

export function htmlFrameRequest(request: HtmlFrameRequest): CanonicalValue {
  verifyHtmlFrameRequest(request);
  return request as unknown as CanonicalValue;
}

export function verifyHtmlFrameImages(value: unknown): asserts value is HtmlFrameImages {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["picture", "frames"].includes(key))) {
    throw new Error("HTML frame images need one picture requirement and absolute frames");
  }
  const result = value as HtmlFrameImages;
  verifyHtmlFramePicture(result.picture);
  if (!Array.isArray(result.frames) || result.frames.length === 0) {
    throw new Error("HTML frame images need at least one absolute frame");
  }
  for (const [index, frame] of result.frames.entries()) {
    if (!Number.isSafeInteger(frame.frame) || frame.frame < 0
      || (index > 0 && frame.frame <= result.frames[index - 1]!.frame)) {
      throw new Error("HTML frame image identities must be strictly increasing non-negative integers");
    }
    try {
      assertBlobRef(frame.artifact, "HTML frame image");
    } catch {
      throw new Error("HTML frame images must contain PNG BlobRefs");
    }
    if (frame.artifact.mediaType !== "image/png" || frame.artifact.size <= 0) {
      throw new Error("HTML frame images must contain PNG BlobRefs");
    }
  }
}

export function verifyHtmlFrameImagesForRequest(
  value: unknown,
  request: HtmlFrameRequest,
): asserts value is HtmlFrameImages {
  verifyHtmlFrameRequest(request);
  verifyHtmlFrameImages(value);
  if (!sameOutputPictureSpec(value.picture, request.picture)) {
    throw new Error("HTML frame images implement a different picture requirement");
  }
  if (value.frames.length !== request.frames.length
    || value.frames.some((frame, index) => frame.frame !== request.frames[index])) {
    throw new Error("HTML frame images do not match the requested absolute frames");
  }
}

export function verifyHtmlRasterRequest(value: unknown): asserts value is HtmlRasterRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => key !== "program" && key !== "delivery" && key !== "range")) {
    throw new Error("HTML raster request requires program, visual delivery and an optional range");
  }
  const request = value as HtmlRasterRequest;
  assertHtmlProgram(request.program);
  verifyVisualDeliverySpec(request.delivery);
  if (request.range !== undefined) assertFrameSpan(request.range, request.program.frameCount);
}

export function htmlRasterRequest(program: HtmlProgram, delivery: VisualDeliverySpec,
  options: { readonly range?: FrameSpan } = {}): CanonicalValue {
  assertHtmlProgram(program);
  verifyVisualDeliverySpec(delivery);
  if (options.range !== undefined) assertFrameSpan(options.range, program.frameCount);
  return { program, delivery, ...(options.range === undefined ? {} : { range: options.range }) };
}
