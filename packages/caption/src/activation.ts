import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import {
  captionComponent, captionManifest, captionModuleRef,
  decodeHiddenCaptionStyleSurface,
  captionMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: captionManifest }],
  facets: [
    ...[captionComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),
    createMarkupSurfaceFacet({ module: captionModuleRef,
    declaration: captionMarkupSurfaces.find((item) => item.name === "hidden")!, handler: decodeHiddenCaptionStyleSurface }),
  ],
};
export default hypitPackage;
