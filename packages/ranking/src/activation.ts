import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeColumnStyleSurface,
  decodeColumnSurface,
  decodeTierBoardStyleSurface,
  decodeTierBoardSurface,
  decodeTopThreeStyleSurface,
  decodeTopThreeSurface,
  decodeTypewriterListStyleSurface,
  decodeTypewriterListSurface,
  rankingComponent,
  rankingManifest,
  rankingMarkupSurfaces,
  rankingModuleRef,
} from "./index.js";

const facets = [
  ["tier-style", decodeTierBoardStyleSurface],
  ["column-style", decodeColumnStyleSurface],
  ["top-three-style", decodeTopThreeStyleSurface],
  ["typewriter-style", decodeTypewriterListStyleSurface],
  ["tier", decodeTierBoardSurface],
  ["column", decodeColumnSurface],
  ["top-three", decodeTopThreeSurface],
  ["typewriter", decodeTypewriterListSurface],
] as const;

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
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

export default narratagePackage;
