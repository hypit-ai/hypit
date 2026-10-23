import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { decodeNarrativeInstantSurface, decodeNarrativeProjectionSurface, decodeNarrativeWindowSurface,
  narrativeProjectionMarkupSurfaces, narrativeTemporalComponent,
  narrativeTemporalManifest, narrativeTemporalModuleRef } from "./index.js";
import { narrativeStudioTemporalDeclarations, narrativeStudioTemporalRelations } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: narrativeTemporalManifest }],
  facets: [
    createStudioCompanionFacet({
      temporalDeclarations: narrativeStudioTemporalDeclarations,
      temporalRelations: narrativeStudioTemporalRelations,
    }),
    ...[narrativeTemporalComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createMarkupSurfaceFacet({ module: narrativeTemporalModuleRef,
      declaration: narrativeProjectionMarkupSurfaces.find((item) => item.name === "narrative-projection")!, handler: decodeNarrativeProjectionSurface }),
    createMarkupSurfaceFacet({ module: narrativeTemporalModuleRef,
      declaration: narrativeProjectionMarkupSurfaces.find((item) => item.name === "narrative-instant")!, handler: decodeNarrativeInstantSurface }),
    createMarkupSurfaceFacet({ module: narrativeTemporalModuleRef,
      declaration: narrativeProjectionMarkupSurfaces.find((item) => item.name === "narrative-window")!, handler: decodeNarrativeWindowSurface }),
  ],
};
export default hypitPackage;
