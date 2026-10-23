import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { htmlDocumentManifest, htmlDocumentModuleRef, htmlDocumentMarkupSurfaces } from "./manifest.js";
import { htmlDocumentComponent } from "./component.js";
import { decodeHtmlDocumentSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlDocumentManifest }],
  facets: [
    createMarkupSurfaceFacet({
      module: htmlDocumentModuleRef,
      declaration: htmlDocumentMarkupSurfaces[0],
      handler: decodeHtmlDocumentSurface,
    }),
    createProducerPackageFacet(htmlDocumentComponent.producers ?? []),
    createRefinementPackageFacet(htmlDocumentComponent.refinements ?? []),
  ],
};
export default hypitPackage;
