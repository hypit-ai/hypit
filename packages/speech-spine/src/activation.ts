import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  decodeSpeechSpineSurface, speechSpineComponent, speechSpineManifest,
  speechSpineModuleRef,
  speechSpineMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: speechSpineManifest,
  }],
  components: [speechSpineComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: speechSpineModuleRef,
    declaration: speechSpineMarkupSurfaces.find((item) => item.name === "spine")!, handler: decodeSpeechSpineSurface,
  })],
};
export default hypitPackage;
