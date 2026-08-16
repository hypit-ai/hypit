import type { ModuleManifest, ProducerRef, TypeRef } from "@narratage/protocol";
import {
  anchoredFrameProgramSchema,
  aspectFrameProgramSchema,
  canvasSpaceSchema,
  contentFitSchema,
  fittedContentSchema,
  frameEdgesProgramSchema,
  intrinsicExtentSchema,
  spatialFrameSchema,
  spatialPathSchema,
  spatialPointSchema,
} from "./schema.js";

export const spatialModuleRef = { name: "@narratage/spatial", version: "1" } as const;
export const spatialTypes = {
  canvas: { module: spatialModuleRef, name: "CanvasSpace" },
  point: { module: spatialModuleRef, name: "SpatialPoint" },
  frame: { module: spatialModuleRef, name: "SpatialFrame" },
  path: { module: spatialModuleRef, name: "SpatialPath" },
  extent: { module: spatialModuleRef, name: "IntrinsicExtent" },
  fit: { module: spatialModuleRef, name: "ContentFit" },
  fitted: { module: spatialModuleRef, name: "FittedContent" },
  frameEdgesProgram: { module: spatialModuleRef, name: "FrameEdgesProgram" },
  anchoredFrameProgram: { module: spatialModuleRef, name: "AnchoredFrameProgram" },
  aspectFrameProgram: { module: spatialModuleRef, name: "AspectFrameProgram" },
} satisfies Record<string, TypeRef>;
export const spatialProducers = {
  canvasFrame: { module: spatialModuleRef, name: "canvas-frame" },
  frameEdges: { module: spatialModuleRef, name: "frame-edges" },
  anchoredFrame: { module: spatialModuleRef, name: "anchored-frame" },
  aspectFrame: { module: spatialModuleRef, name: "aspect-frame" },
  fitContent: { module: spatialModuleRef, name: "fit-content" },
} satisfies Record<string, ProducerRef>;

export const spatialMarkupSurfaces = [
    { name: "canvas", tag: "Canvas", mode: "structured", outputs: [spatialTypes.canvas] },
    { name: "point", tag: "Point", mode: "structured", outputs: [spatialTypes.point] },
    { name: "path", tag: "Path", mode: "structured", outputs: [spatialTypes.path] },
    { name: "extent", tag: "Extent", mode: "structured", outputs: [spatialTypes.extent] },
    { name: "frame", tag: "Frame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.frameEdgesProgram] },
    { name: "anchored-frame", tag: "AnchoredFrame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.anchoredFrameProgram] },
    { name: "aspect-frame", tag: "AspectFrame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.extent, spatialTypes.aspectFrameProgram] },
  ] as const;


export const spatialManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: spatialModuleRef.name,
  version: spatialModuleRef.version,
  dependencies: [],
  types: [
    { name: spatialTypes.canvas.name },
    { name: spatialTypes.point.name },
    { name: spatialTypes.frame.name },
    { name: spatialTypes.path.name },
    { name: spatialTypes.extent.name },
    { name: spatialTypes.fit.name },
    { name: spatialTypes.fitted.name },
    { name: spatialTypes.frameEdgesProgram.name },
    { name: spatialTypes.anchoredFrameProgram.name },
    { name: spatialTypes.aspectFrameProgram.name },
  ],
  capabilities: [],
  producers: [
    { name: spatialProducers.canvasFrame.name, inputs: [{ name: "canvas", type: spatialTypes.canvas }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.frameEdges.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.frameEdgesProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.anchoredFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.anchoredFrameProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.aspectFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "program", type: spatialTypes.aspectFrameProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.fitContent.name, inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }], outputs: [{ name: "fitted", type: spatialTypes.fitted }], needs: [] },
  ],
};
export const spatialDependency = { module: spatialModuleRef } as const;
