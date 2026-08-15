import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  grokImagineComponent,
  grokImagineManifest,
  grokImagineModuleRef,
  grokImagineMarkupSurfaces,
} from "./index.js";
import { decodeGrokImaginePreviewVideoSurface, decodeGrokImagineVideoSurface } from "./surface.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: grokImagineManifest }],
  components: [grokImagineComponent],
  hostFacets: [
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
export default narratagePackage;
