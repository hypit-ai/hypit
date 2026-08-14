import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef } from "@narratage/protocol";

import { spatialImplementationDigests, spatialValidatorDigests } from "./geometry.js";
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
export const spatialSurfaceDigests = {
  canvas: digestOf("@narratage/spatial/canvas-surface@1"),
  point: digestOf("@narratage/spatial/point-surface@1"),
  path: digestOf("@narratage/spatial/path-surface@1"),
  extent: digestOf("@narratage/spatial/extent-surface@1"),
  frame: digestOf("@narratage/spatial/frame-surface@1"),
  anchoredFrame: digestOf("@narratage/spatial/anchored-frame-surface@1"),
  aspectFrame: digestOf("@narratage/spatial/aspect-frame-surface@1"),
} as const;
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

const validator = (digest: ReturnType<typeof digestOf>) => ({
  implementation: { digest },
});

export const spatialMarkupSurfaces = [
    { name: "canvas", tag: "Canvas", mode: "structured", outputs: [spatialTypes.canvas], implementation: { digest: spatialSurfaceDigests.canvas } },
    { name: "point", tag: "Point", mode: "structured", outputs: [spatialTypes.point], implementation: { digest: spatialSurfaceDigests.point } },
    { name: "path", tag: "Path", mode: "structured", outputs: [spatialTypes.path], implementation: { digest: spatialSurfaceDigests.path } },
    { name: "extent", tag: "Extent", mode: "structured", outputs: [spatialTypes.extent], implementation: { digest: spatialSurfaceDigests.extent } },
    { name: "frame", tag: "Frame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.frameEdgesProgram], implementation: { digest: spatialSurfaceDigests.frame } },
    { name: "anchored-frame", tag: "AnchoredFrame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.anchoredFrameProgram], implementation: { digest: spatialSurfaceDigests.anchoredFrame } },
    { name: "aspect-frame", tag: "AspectFrame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.extent, spatialTypes.aspectFrameProgram], implementation: { digest: spatialSurfaceDigests.aspectFrame } },
  ] as const;


export const spatialManifest: ModuleManifest = {
  format: "svml.module@1",
  name: spatialModuleRef.name,
  version: spatialModuleRef.version,
  dependencies: [],
  types: [
    { name: spatialTypes.canvas.name, schema: canvasSpaceSchema, validator: validator(spatialValidatorDigests.canvas) },
    { name: spatialTypes.point.name, schema: spatialPointSchema, validator: validator(spatialValidatorDigests.point) },
    { name: spatialTypes.frame.name, schema: spatialFrameSchema, validator: validator(spatialValidatorDigests.frame) },
    { name: spatialTypes.path.name, schema: spatialPathSchema, validator: validator(spatialValidatorDigests.path) },
    { name: spatialTypes.extent.name, schema: intrinsicExtentSchema, validator: validator(spatialValidatorDigests.extent) },
    { name: spatialTypes.fit.name, schema: contentFitSchema, validator: validator(spatialValidatorDigests.fit) },
    { name: spatialTypes.fitted.name, schema: fittedContentSchema, validator: validator(spatialValidatorDigests.fitted) },
    { name: spatialTypes.frameEdgesProgram.name, schema: frameEdgesProgramSchema },
    { name: spatialTypes.anchoredFrameProgram.name, schema: anchoredFrameProgramSchema },
    { name: spatialTypes.aspectFrameProgram.name, schema: aspectFrameProgramSchema },
  ],
  capabilities: [],
  producers: [
    { name: spatialProducers.canvasFrame.name, inputs: [{ name: "canvas", type: spatialTypes.canvas }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [], implementation: { digest: spatialImplementationDigests.canvasFrame } },
    { name: spatialProducers.frameEdges.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.frameEdgesProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [], implementation: { digest: spatialImplementationDigests.frameEdges } },
    { name: spatialProducers.anchoredFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.anchoredFrameProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [], implementation: { digest: spatialImplementationDigests.anchoredFrame } },
    { name: spatialProducers.aspectFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "program", type: spatialTypes.aspectFrameProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [], implementation: { digest: spatialImplementationDigests.aspectFrame } },
    { name: spatialProducers.fitContent.name, inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }], outputs: [{ name: "fitted", type: spatialTypes.fitted }], needs: [], implementation: { digest: spatialImplementationDigests.fitContent } },
  ],
};
export const spatialManifestDigest = digestOf(spatialManifest);
export const spatialDependency = { module: spatialModuleRef, digest: spatialManifestDigest } as const;
