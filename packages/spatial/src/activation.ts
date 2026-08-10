import { createMarkupSurfaceHostFacet } from "@narratage/markup";

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
    createMarkupSurfaceHostFacet({ module: spatialModuleRef, surface: "canvas", mode: "structured", implementationDigest: spatialSurfaceDigests.canvas, handler: decodeCanvasSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef, surface: "point", mode: "structured", implementationDigest: spatialSurfaceDigests.point, handler: decodePointSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef, surface: "path", mode: "structured", implementationDigest: spatialSurfaceDigests.path, handler: decodePathSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef, surface: "extent", mode: "structured", implementationDigest: spatialSurfaceDigests.extent, handler: decodeExtentSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef, surface: "frame", mode: "structured", implementationDigest: spatialSurfaceDigests.frame, handler: decodeFrameSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef, surface: "anchored-frame", mode: "structured", implementationDigest: spatialSurfaceDigests.anchoredFrame, handler: decodeAnchoredFrameSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef, surface: "aspect-frame", mode: "structured", implementationDigest: spatialSurfaceDigests.aspectFrame, handler: decodeAspectFrameSurface }),
  ],
};
export default svmlPackage;
