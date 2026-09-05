import type { CanonicalValue } from "@hypit/protocol";
import { assertHyperframesDocument } from "@hypit/hyperframes";
import type { HyperframesDocument } from "@hypit/hyperframes";
import { verifyMediaFrameRange } from "@hypit/media";
import type { MediaFrameRange } from "@hypit/media";

export type HyperframesVisualRequest = {
  readonly document: HyperframesDocument;
  readonly range?: MediaFrameRange;
};

export function verifyHyperframesVisualRequest(value: unknown): asserts value is HyperframesVisualRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => key !== "document" && key !== "range")) {
    throw new Error("HyperFrames visual request requires document and an optional range");
  }
  const request = value as HyperframesVisualRequest;
  assertHyperframesDocument(request.document);
  if (request.range !== undefined) verifyMediaFrameRange(request.range, request.document.frameCount);
}

export function hyperframesVisualRequest(document: HyperframesDocument, options: { readonly range?: MediaFrameRange } = {}): CanonicalValue {
  assertHyperframesDocument(document);
  if (options.range !== undefined) verifyMediaFrameRange(options.range, document.frameCount);
  return {
    document,
    ...(options.range === undefined ? {} : { range: options.range }),
  };
}
