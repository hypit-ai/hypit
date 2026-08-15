import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  captionComponent, captionManifest, captionModuleRef,
  decodeCaptionProgramSurface,
  captionMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: captionManifest }],
  components: [captionComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({ module: captionModuleRef,
    declaration: captionMarkupSurfaces.find((item) => item.name === "program")!, handler: decodeCaptionProgramSurface }),
  ],
};
export default narratagePackage;
