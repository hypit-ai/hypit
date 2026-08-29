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
  spatialTypes,
} from "./manifest.js";
export {
  contentFitSchema,
  intrinsicExtentSchema,
  spatialFrameSchema,
  spatialRegionTimelineSchema,
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
  decodeRegionTimelineSurface,
} from "./surface.js";
export { spatialRegionTimeline } from "./region-timeline.js";
export type * from "./types.js";
