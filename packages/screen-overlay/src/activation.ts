import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeScreenOverlaySurface, screenOverlayComponent, screenOverlayManifest, screenOverlayModuleRef,
  screenOverlayMarkupSurfaces,
} from "./index.js";
export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: screenOverlayManifest }],
  components: [screenOverlayComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: screenOverlayModuleRef,
    declaration: screenOverlayMarkupSurfaces.find((item) => item.name === "track")!, handler: decodeScreenOverlaySurface,
  })],
};
export default narratagePackage;
