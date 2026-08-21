import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeColumnStyleSurface,
  decodeColumnSurface,
  decodeTopThreeStyleSurface,
  decodeTopThreeSurface,
  rankingComponent,
  rankingManifest,
  rankingMarkupSurfaces,
  rankingModuleRef,
} from "./index.js";

const facets = [
  ["column-style", decodeColumnStyleSurface],
  ["top-three-style", decodeTopThreeStyleSurface],
  ["column", decodeColumnSurface],
  ["top-three", decodeTopThreeSurface],
] as const;

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: rankingManifest,
  }],
  components: [rankingComponent],
  hostFacets: facets.map(([surface, handler]) => createMarkupSurfaceHostFacet({
    module: rankingModuleRef,
    declaration: rankingMarkupSurfaces.find((item) => item.name === surface)!,
    handler,
  })),
};

export default hypitPackage;
