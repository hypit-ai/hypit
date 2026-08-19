import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  decodeMediaTrackSurface,
  mediaTrackComponent,
  mediaTrackManifest,
  mediaTrackModuleRef,
  mediaTrackMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: mediaTrackManifest }],
  components: [mediaTrackComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: mediaTrackModuleRef,
    declaration: mediaTrackMarkupSurfaces.find((item) => item.name === "track")!,
    handler: decodeMediaTrackSurface,
  })],
};
export default hypitPackage;
