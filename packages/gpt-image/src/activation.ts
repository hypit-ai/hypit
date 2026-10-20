import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";

import {
  gptImageCleanManifest,
  gptImageCleanModuleRef,
  gptImageComponent,
  gptImageDefinition,
  gptImageManifest,
  gptImageMarkupSurfaces,
  gptImageModuleRef,
  gptImageCleanMarkupSurfaces,
} from "./index.js";
import {
  decodeCleanGptImageSurface,
  decodeGptImageSurface,
} from "./surface.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: gptImageManifest,
  }, {
    manifest: gptImageCleanManifest,
  }],
  facets: [
    ...[gptImageComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),
    createMarkupSurfaceFacet({
      module: gptImageModuleRef,
    declaration: gptImageMarkupSurfaces.find((item) => item.name === "image")!,
      handler: decodeGptImageSurface,
    }),
    createMarkupSurfaceFacet({
      module: gptImageCleanModuleRef,
    declaration: gptImageCleanMarkupSurfaces.find((item) => item.name === "image")!,
      handler: decodeCleanGptImageSurface,
    }),
  ],
};
export default hypitPackage;
