import type { CanonicalValue, BlobRef } from "@hypit/hypit/protocol";
import { assertBlobRef } from "@hypit/hypit/protocol";
import { verifyMediaFrameRange } from "@hypit/media";
import type { MediaFrameRange } from "@hypit/media";
import { assertHtmlProgram } from "./document.js";
import type { HtmlProgram } from "./types.js";

export type HtmlRasterRequest = {
  readonly program: HtmlProgram;
  readonly range?: MediaFrameRange;
};

/** Select original program frames in strictly increasing order. */
export type HtmlFrameRequest = {
  readonly program: HtmlProgram;
  readonly frames: readonly number[];
};

/** PNG images in request order; the request owns their frame identities. */
export type HtmlFrameImages = readonly BlobRef[];

export function verifyHtmlFrameRequest(value: unknown): asserts value is HtmlFrameRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["program", "frames"].includes(key))) {
    throw new Error("HTML frame request needs one program and frames");
  }
  const request = value as HtmlFrameRequest;
  assertHtmlProgram(request.program);
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
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("HTML frame images must be PNG BlobRefs in request order");
  }
  for (const blob of value) {
    try {
      assertBlobRef(blob, "HTML frame image");
    } catch {
      throw new Error("HTML frame images must be PNG BlobRefs in request order");
    }
    if (blob.mediaType !== "image/png" || blob.size <= 0) {
      throw new Error("HTML frame images must be PNG BlobRefs in request order");
    }
  }
}

export function verifyHtmlRasterRequest(value: unknown): asserts value is HtmlRasterRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => key !== "program" && key !== "range")) {
    throw new Error("HTML raster request requires program and an optional range");
  }
  const request = value as HtmlRasterRequest;
  assertHtmlProgram(request.program);
  if (request.range !== undefined) verifyMediaFrameRange(request.range, request.program.frameCount);
}

export function htmlRasterRequest(program: HtmlProgram, options: { readonly range?: MediaFrameRange } = {}): CanonicalValue {
  assertHtmlProgram(program);
  if (options.range !== undefined) verifyMediaFrameRange(options.range, program.frameCount);
  return { program, ...(options.range === undefined ? {} : { range: options.range }) };
}
