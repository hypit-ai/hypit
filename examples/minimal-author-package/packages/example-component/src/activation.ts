import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import { decodeExampleSurface, exampleComponent, exampleManifest, exampleMarkupSurfaces, exampleModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: exampleManifest }],
  components: [exampleComponent],
  hostFacets: exampleMarkupSurfaces.map((declaration) => createMarkupSurfaceHostFacet({ module: exampleModuleRef, declaration, handler: decodeExampleSurface })),
};
export default hypitPackage;
