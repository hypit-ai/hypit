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
  spatialMarkupSurfaces,
} from "./manifest.js";
import { spatialComponent } from "./component.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: spatialManifest }],
  components: [spatialComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "canvas")!, handler: decodeCanvasSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "point")!, handler: decodePointSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "path")!, handler: decodePathSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "extent")!, handler: decodeExtentSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "frame")!, handler: decodeFrameSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "anchored-frame")!, handler: decodeAnchoredFrameSurface }),
    createMarkupSurfaceHostFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "aspect-frame")!, handler: decodeAspectFrameSurface }),
  ],
};
export default svmlPackage;
