import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeTextRenderSurface,
  decodeTextValueSurface,
  textComponent,
  textImplementationDigests,
  textManifest,
  textModuleRef,
  textSvsFrontend,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/text",
  modules: [{ manifest: textManifest, specifiers: ["@narratage/text", "@narratage/text@1"] }],
  authorFrontends: [textSvsFrontend],
  components: [textComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: textModuleRef,
      surface: "value",
      mode: "structured",
      implementationDigest: textImplementationDigests.valueSurface,
      handler: decodeTextValueSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: textModuleRef,
      surface: "render",
      mode: "structured",
      implementationDigest: textImplementationDigests.renderSurface,
      handler: decodeTextRenderSurface,
    }),
  ],
};

export default svmlPackage;
