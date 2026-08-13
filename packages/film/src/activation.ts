import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeFilmSurface, filmComponent, filmManifest, filmModuleRef,
  filmMarkupSurfaces,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: filmManifest }],
  components: [filmComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: filmModuleRef,
    declaration: filmMarkupSurfaces.find((item) => item.name === "film")!, handler: decodeFilmSurface,
  })],
};
export default svmlPackage;
