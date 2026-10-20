import { createRefinementPackageFacet } from "@hypit/refinement";
import { createProducerPackageFacet } from "@hypit/producer";
import { createAuthorFrontendFacet } from "@hypit/author";
import { createMarkupSurfaceFacet } from "@hypit/markup";

import {
  decodeTextRenderSurface,
  decodeTextValueSurface,
  textComponent,
  textManifest,
  textModuleRef,
  textRecipeFrontend,
  textMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: textManifest }],
  facets: [
    ...[textComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),
    createAuthorFrontendFacet(textRecipeFrontend),
    createMarkupSurfaceFacet({
      module: textModuleRef,
    declaration: textMarkupSurfaces.find((item) => item.name === "value")!,
      handler: decodeTextValueSurface,
    }),
    createMarkupSurfaceFacet({
      module: textModuleRef,
    declaration: textMarkupSurfaces.find((item) => item.name === "render")!,
      handler: decodeTextRenderSurface,
    }),
  ],
};

export default hypitPackage;
