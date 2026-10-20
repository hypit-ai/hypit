import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import { anchoredFrame, aspectFrame, assertCanvas, assertContentFit, assertIntrinsicExtent, assertSpatialFrame, assertSpatialMap2D, assertSpatialPath, assertSpatialPoint, frameFromEdges, resolveContentFit } from "./geometry.js";
import { spatialProducers, spatialTypes } from "./manifest.js";
import type {
  AnchoredFrameProgram,
  AspectFrameProgram,
  Canvas,
  ContentFit,
  FrameEdgesProgram,
  IntrinsicExtent,
  SpatialFrame,
  SpatialMap2D,
  SpatialPath,
  SpatialPoint,
} from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}
const output = (value: unknown) => ((canonicalize(value)));

export const spatialComponent = {
  producers: [
    { producer: spatialProducers.frameEdges, handler: ({ inputs }) => ({ kind: "output", value: output(frameFromEdges(valueOf<SpatialFrame>(inputs.parent?.value, "SpatialFrame"), valueOf<FrameEdgesProgram>(inputs.program?.value, "FrameEdgesProgram"))) }) },
    { producer: spatialProducers.anchoredFrame, handler: ({ inputs }) => ({ kind: "output", value: output(anchoredFrame(valueOf<SpatialFrame>(inputs.parent?.value, "SpatialFrame"), valueOf<AnchoredFrameProgram>(inputs.program?.value, "AnchoredFrameProgram"))) }) },
    { producer: spatialProducers.aspectFrame, handler: ({ inputs }) => ({ kind: "output", value: output(aspectFrame(valueOf<SpatialFrame>(inputs.parent?.value, "SpatialFrame"), valueOf<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"), valueOf<AspectFrameProgram>(inputs.program?.value, "AspectFrameProgram"))) }) },
    { producer: spatialProducers.resolveContentFit, handler: ({ inputs }) => ({ kind: "output", value: output(resolveContentFit(valueOf<SpatialFrame>(inputs.frame?.value, "SpatialFrame"), valueOf<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"), valueOf<ContentFit>(inputs.fit?.value, "ContentFit"))) }) },
  ],
  refinements: [
    { type: spatialTypes.canvas, handler: ({ value }) => assertCanvas(valueOf<Canvas>(value, "Canvas")) },
    { type: spatialTypes.point, handler: ({ value }) => assertSpatialPoint(valueOf<SpatialPoint>(value, "SpatialPoint")) },
    { type: spatialTypes.frame, handler: ({ value }) => assertSpatialFrame(valueOf<SpatialFrame>(value, "SpatialFrame")) },
    { type: spatialTypes.path, handler: ({ value }) => assertSpatialPath(valueOf<SpatialPath>(value, "SpatialPath")) },
    { type: spatialTypes.extent, handler: ({ value }) => assertIntrinsicExtent(valueOf<IntrinsicExtent>(value, "IntrinsicExtent")) },
    { type: spatialTypes.map2D, handler: ({ value }) => assertSpatialMap2D(valueOf<SpatialMap2D>(value, "SpatialMap2D")) },
    { type: spatialTypes.fit, handler: ({ value }) => assertContentFit(valueOf<ContentFit>(value, "ContentFit")) },
  ],
} satisfies ProducerPackage & RefinementPackage;
