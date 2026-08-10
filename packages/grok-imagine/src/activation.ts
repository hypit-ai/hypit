import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  grokImagineComponent,
  grokImagineManifest,
  grokImagineModuleRef,
  grokImagineSurfaceImplementationDigests,
} from "./index.js";
import { decodeGrokImaginePreviewVideoSurface, decodeGrokImagineVideoSurface } from "./surface.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/grok-imagine",
  modules: [{ manifest: grokImagineManifest, specifiers: ["@narratage/grok-imagine", "@narratage/grok-imagine@1"] }],
  components: [grokImagineComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: grokImagineModuleRef,
      surface: "video",
      mode: "structured",
      implementationDigest: grokImagineSurfaceImplementationDigests.video,
      handler: decodeGrokImagineVideoSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: grokImagineModuleRef,
      surface: "preview-video",
      mode: "structured",
      implementationDigest: grokImagineSurfaceImplementationDigests.previewVideo,
      handler: decodeGrokImaginePreviewVideoSurface,
    }),
  ],
};
export default svmlPackage;
