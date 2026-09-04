import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  grokImagineComponent,
  grokImagineDefinition,
  grokImagineManifest,
  grokImagineModuleRef,
  grokImagineMarkupSurfaces,
} from "./index.js";
import { decodeGrokImaginePreviewVideoSurface, decodeGrokImagineVideoSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: grokImagineManifest }],
  components: [grokImagineComponent],
  hostFacets: [
    grokImagineDefinition.hostFacet,
    ...(grokImagineDefinition.runFragmentFacet === undefined ? [] : [grokImagineDefinition.runFragmentFacet]),
    createMarkupSurfaceHostFacet({
      module: grokImagineModuleRef,
    declaration: grokImagineMarkupSurfaces.find((item) => item.name === "video")!,
      handler: decodeGrokImagineVideoSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: grokImagineModuleRef,
    declaration: grokImagineMarkupSurfaces.find((item) => item.name === "preview-video")!,
      handler: decodeGrokImaginePreviewVideoSurface,
    }),
  ],
};
export default hypitPackage;
