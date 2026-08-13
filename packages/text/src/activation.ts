import { createAuthorFrontendHostFacet } from "@narratage/elaborator";
import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeTextRenderSurface,
  decodeTextValueSurface,
  textComponent,
  textManifest,
  textModuleRef,
  textSvsFrontend,
  textMarkupSurfaces,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
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

export default svmlPackage;
