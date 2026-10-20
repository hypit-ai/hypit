import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { decodeExampleSurface, exampleComponent, exampleManifest, exampleMarkupSurfaces, exampleModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: exampleManifest }],
  facets: [
    createProducerPackageFacet(exampleComponent),
    createRefinementPackageFacet(exampleComponent),
    ...exampleMarkupSurfaces.map((declaration) => createMarkupSurfaceFacet({ module: exampleModuleRef, declaration, handler: decodeExampleSurface })),
  ],
};
export default hypitPackage;
