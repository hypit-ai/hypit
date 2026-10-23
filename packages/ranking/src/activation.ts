import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";

import {
  decodeColumnStyleSurface,
  decodeColumnSurface,
  decodeTierBoardStyleSurface,
  decodeTierBoardSurface,
  decodeTopThreeStyleSurface,
  decodeTopThreeSurface,
  rankingComponent,
  rankingManifest,
  rankingMarkupSurfaces,
  rankingModuleRef,
} from "./index.js";
import { rankingStudioTrackCompanions } from "./studio.js";

const facets = [
  ["tier-style", decodeTierBoardStyleSurface],
  ["column-style", decodeColumnStyleSurface],
  ["top-three-style", decodeTopThreeStyleSurface],
  ["tier", decodeTierBoardSurface],
  ["column", decodeColumnSurface],
  ["top-three", decodeTopThreeSurface],
] as const;

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: rankingManifest,
  }],
  facets: [
    ...[rankingComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...facets.map(([surface, handler]) => createMarkupSurfaceFacet({
      module: rankingModuleRef,
      declaration: rankingMarkupSurfaces.find((item) => item.name === surface)!,
      handler,
    })),
    createStudioTrackCompanionFacet(rankingStudioTrackCompanions),
  ],
};

export default hypitPackage;
