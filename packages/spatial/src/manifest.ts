import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
export const spatialModuleRef = { name: "@hypit/spatial", version: "1" } as const;
export const spatialTypes = {
  canvas: { module: spatialModuleRef, name: "Canvas" },
  point: { module: spatialModuleRef, name: "SpatialPoint" },
  frame: { module: spatialModuleRef, name: "SpatialFrame" },
  path: { module: spatialModuleRef, name: "SpatialPath" },
  extent: { module: spatialModuleRef, name: "IntrinsicExtent" },
  map2D: { module: spatialModuleRef, name: "SpatialMap2D" },
  fit: { module: spatialModuleRef, name: "ContentFit" },
  frameEdgesProgram: { module: spatialModuleRef, name: "FrameEdgesProgram" },
  anchoredFrameProgram: { module: spatialModuleRef, name: "AnchoredFrameProgram" },
  aspectFrameProgram: { module: spatialModuleRef, name: "AspectFrameProgram" },
} satisfies Record<string, TypeRef>;
export const spatialProducers = {
  frameEdges: { module: spatialModuleRef, name: "frame-edges" },
  anchoredFrame: { module: spatialModuleRef, name: "anchored-frame" },
  aspectFrame: { module: spatialModuleRef, name: "aspect-frame" },
  resolveContentFit: { module: spatialModuleRef, name: "resolve-content-fit" },
} satisfies Record<string, ProducerRef>;


export const spatialManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: spatialModuleRef.name,
  version: spatialModuleRef.version,
  dependencies: [],
  types: [
    spatialTypes.canvas.name,
    spatialTypes.point.name,
    spatialTypes.frame.name,
    spatialTypes.path.name,
    spatialTypes.extent.name,
    spatialTypes.map2D.name,
    spatialTypes.fit.name,
    spatialTypes.frameEdgesProgram.name,
    spatialTypes.anchoredFrameProgram.name,
    spatialTypes.aspectFrameProgram.name,
  ],
  capabilities: [],
  producers: [
    { name: spatialProducers.frameEdges.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.frameEdgesProgram }], result: { kind: "output" as const, name: "frame", type: spatialTypes.frame } },
    { name: spatialProducers.anchoredFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.anchoredFrameProgram }], result: { kind: "output" as const, name: "frame", type: spatialTypes.frame } },
    { name: spatialProducers.aspectFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "program", type: spatialTypes.aspectFrameProgram }], result: { kind: "output" as const, name: "frame", type: spatialTypes.frame } },
    { name: spatialProducers.resolveContentFit.name, inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }], result: { kind: "output" as const, name: "mapping", type: spatialTypes.map2D } },
  ],
};
export const spatialDependency = spatialModuleRef;
