import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";

import {
  decodeAnchoredFrameSurface,
  decodeAspectFrameSurface,
  decodeCanvasSurface,
  decodeExtentSurface,
  decodeFrameSurface,
  decodeMapSurface,
  decodePathSurface,
  decodePointSurface,
} from "./surface.js";
import {
  spatialManifest,
  spatialModuleRef,
  spatialMarkupSurfaces,
} from "./manifest.js";
import { spatialComponent } from "./component.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: spatialManifest }],
  facets: [
    ...[spatialComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "canvas")!, handler: decodeCanvasSurface }),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "point")!, handler: decodePointSurface }),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "path")!, handler: decodePathSurface }),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "extent")!, handler: decodeExtentSurface }),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "map")!, handler: decodeMapSurface }),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "frame")!, handler: decodeFrameSurface }),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "anchored-frame")!, handler: decodeAnchoredFrameSurface }),
    createMarkupSurfaceFacet({ module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "aspect-frame")!, handler: decodeAspectFrameSurface }),
  ],
};
export default hypitPackage;
