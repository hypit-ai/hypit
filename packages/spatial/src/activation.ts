import { createTextSurfaceHostFacet } from "@narratage/text";

import {
  decodeAnchoredFrameSurface,
  decodeAspectFrameSurface,
  decodeCanvasSurface,
  decodeExtentSurface,
  decodeFrameSurface,
  decodePathSurface,
  decodePointSurface,
} from "./surface.js";
import {
  spatialManifest,
  spatialModuleRef,
  spatialSurfaceDigests,
} from "./manifest.js";
import { spatialComponent } from "./component.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/spatial",
  modules: [{ manifest: spatialManifest, specifiers: ["@narratage/spatial", "@narratage/spatial@1"] }],
  components: [spatialComponent],
  hostFacets: [
    createTextSurfaceHostFacet({ module: spatialModuleRef, surface: "canvas", mode: "structured", implementationDigest: spatialSurfaceDigests.canvas, handler: decodeCanvasSurface }),
    createTextSurfaceHostFacet({ module: spatialModuleRef, surface: "point", mode: "structured", implementationDigest: spatialSurfaceDigests.point, handler: decodePointSurface }),
    createTextSurfaceHostFacet({ module: spatialModuleRef, surface: "path", mode: "structured", implementationDigest: spatialSurfaceDigests.path, handler: decodePathSurface }),
    createTextSurfaceHostFacet({ module: spatialModuleRef, surface: "extent", mode: "structured", implementationDigest: spatialSurfaceDigests.extent, handler: decodeExtentSurface }),
    createTextSurfaceHostFacet({ module: spatialModuleRef, surface: "frame", mode: "structured", implementationDigest: spatialSurfaceDigests.frame, handler: decodeFrameSurface }),
    createTextSurfaceHostFacet({ module: spatialModuleRef, surface: "anchored-frame", mode: "structured", implementationDigest: spatialSurfaceDigests.anchoredFrame, handler: decodeAnchoredFrameSurface }),
    createTextSurfaceHostFacet({ module: spatialModuleRef, surface: "aspect-frame", mode: "structured", implementationDigest: spatialSurfaceDigests.aspectFrame, handler: decodeAspectFrameSurface }),
  ],
};
export default svmlPackage;
