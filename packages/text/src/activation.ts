import { createAuthorFrontendHostFacet } from "@hypit/elaborator";
import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeTextRenderSurface,
  decodeTextValueSurface,
  textComponent,
  textManifest,
  textModuleRef,
  textSvsFrontend,
  textMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: textManifest }],
  components: [textComponent],
  hostFacets: [
    createAuthorFrontendHostFacet(textSvsFrontend),
    createMarkupSurfaceHostFacet({
      module: textModuleRef,
    declaration: textMarkupSurfaces.find((item) => item.name === "value")!,
      handler: decodeTextValueSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: textModuleRef,
    declaration: textMarkupSurfaces.find((item) => item.name === "render")!,
      handler: decodeTextRenderSurface,
    }),
  ],
};

export default hypitPackage;
