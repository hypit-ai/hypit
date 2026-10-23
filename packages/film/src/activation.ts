import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import {
  decodeFilmSurface, filmComponent, filmManifest, filmModuleRef,
  filmMarkupSurfaces,
} from "./index.js";
import { filmStudioCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: filmManifest }],
  facets: [
    createProducerPackageFacet(filmComponent.producers),
    createRefinementPackageFacet(filmComponent.refinements ?? []),
    createMarkupSurfaceFacet({
      module: filmModuleRef,
      declaration: filmMarkupSurfaces.find((item) => item.name === "film")!, handler: decodeFilmSurface,
    }),
    createStudioCompanionFacet({ films: filmStudioCompanions }),
  ],
};
export default hypitPackage;
