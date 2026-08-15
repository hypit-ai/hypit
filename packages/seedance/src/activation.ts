import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeSeedanceFrameVideoSurface,
  decodeSeedanceReferenceVideoSurface,
  decodeSeedanceTextVideoSurface,
  seedanceComponent,
  seedanceManifest,
  seedanceModuleRef,
  seedanceMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: seedanceManifest }],
  components: [seedanceComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
    declaration: seedanceMarkupSurfaces.find((item) => item.name === "text-video")!,
      handler: decodeSeedanceTextVideoSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
    declaration: seedanceMarkupSurfaces.find((item) => item.name === "frame-video")!,
      handler: decodeSeedanceFrameVideoSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
    declaration: seedanceMarkupSurfaces.find((item) => item.name === "reference-video")!,
      handler: decodeSeedanceReferenceVideoSurface,
    }),
  ],
};

export default narratagePackage;
