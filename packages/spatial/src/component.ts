import type { ComponentPackage } from "@narratage/component-kit";
import { canonicalize } from "@narratage/protocol";
import type { StoredValue } from "@narratage/protocol";

import { anchoredFrame, aspectFrame, assertCanvasSpace, assertContentFit, assertFittedContent, assertIntrinsicExtent, assertSpatialFrame, assertSpatialPath, assertSpatialPoint, canvasFrame, fitContent, frameFromEdges } from "./geometry.js";
import { spatialProducers, spatialTypes } from "./manifest.js";
import type {
  AnchoredFrameProgram,
  AspectFrameProgram,
  CanvasSpace,
  ContentFit,
  FittedContent,
  FrameEdgesProgram,
  IntrinsicExtent,
  SpatialFrame,
  SpatialPath,
  SpatialPoint,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

export const spatialComponent = {
  producers: [
    { producer: spatialProducers.canvasFrame, handler: ({ inputs }) => ({ outputs: { frame: output(canvasFrame(inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"))) }, needs: {} }) },
    { producer: spatialProducers.frameEdges, handler: ({ inputs }) => ({ outputs: { frame: output(frameFromEdges(inline<SpatialFrame>(inputs.parent?.value, "SpatialFrame"), inline<FrameEdgesProgram>(inputs.program?.value, "FrameEdgesProgram"))) }, needs: {} }) },
    { producer: spatialProducers.anchoredFrame, handler: ({ inputs }) => ({ outputs: { frame: output(anchoredFrame(inline<SpatialFrame>(inputs.parent?.value, "SpatialFrame"), inline<AnchoredFrameProgram>(inputs.program?.value, "AnchoredFrameProgram"))) }, needs: {} }) },
    { producer: spatialProducers.aspectFrame, handler: ({ inputs }) => ({ outputs: { frame: output(aspectFrame(inline<SpatialFrame>(inputs.parent?.value, "SpatialFrame"), inline<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"), inline<AspectFrameProgram>(inputs.program?.value, "AspectFrameProgram"))) }, needs: {} }) },
    { producer: spatialProducers.fitContent, handler: ({ inputs }) => ({ outputs: { fitted: output(fitContent(inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"), inline<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"), inline<ContentFit>(inputs.fit?.value, "ContentFit"))) }, needs: {} }) },
  ],
  validators: [
    { type: spatialTypes.canvas, handler: ({ value }) => assertCanvasSpace(inline<CanvasSpace>(value, "CanvasSpace")) },
    { type: spatialTypes.point, handler: ({ value }) => assertSpatialPoint(inline<SpatialPoint>(value, "SpatialPoint")) },
    { type: spatialTypes.frame, handler: ({ value }) => assertSpatialFrame(inline<SpatialFrame>(value, "SpatialFrame")) },
    { type: spatialTypes.path, handler: ({ value }) => assertSpatialPath(inline<SpatialPath>(value, "SpatialPath")) },
    { type: spatialTypes.extent, handler: ({ value }) => assertIntrinsicExtent(inline<IntrinsicExtent>(value, "IntrinsicExtent")) },
    { type: spatialTypes.fit, handler: ({ value }) => assertContentFit(inline<ContentFit>(value, "ContentFit")) },
    { type: spatialTypes.fitted, handler: ({ value }) => assertFittedContent(inline<FittedContent>(value, "FittedContent")) },
  ],
} satisfies ComponentPackage;
