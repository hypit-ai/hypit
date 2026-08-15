export { spatialComponent } from "./component.js";
export { contentFitPropertyNames, decodeContentFitProperties } from "./author.js";
export {
  anchoredFrameFragment,
  aspectFrameFragment,
  canvasFrameFragment,
  fitContentFragment,
  frameEdgesFragment,
} from "./fragment.js";
export * from "./geometry.js";
export {
  spatialDependency,
  spatialManifest, spatialMarkupSurfaces,
  spatialModuleRef,
  spatialProducers,
  spatialSurfaceDigests,
  spatialTypes,
} from "./manifest.js";
export {
  contentFitSchema,
  intrinsicExtentSchema,
  spatialFrameSchema,
  spatialPathSchema,
  spatialPointSchema,
} from "./schema.js";
export {
  decodeAnchoredFrameSurface,
  decodeAspectFrameSurface,
  decodeCanvasSurface,
  decodeExtentSurface,
  decodeFrameSurface,
  decodePathSurface,
  decodePointSurface,
} from "./surface.js";
export type * from "./types.js";
