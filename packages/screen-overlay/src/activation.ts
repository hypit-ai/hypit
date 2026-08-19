import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  decodeScreenOverlaySurface, screenOverlayComponent, screenOverlayManifest, screenOverlayModuleRef,
  screenOverlayMarkupSurfaces,
} from "./index.js";
export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: screenOverlayManifest }],
  components: [screenOverlayComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: screenOverlayModuleRef,
    declaration: screenOverlayMarkupSurfaces.find((item) => item.name === "track")!, handler: decodeScreenOverlaySurface,
  })],
};
export default hypitPackage;
