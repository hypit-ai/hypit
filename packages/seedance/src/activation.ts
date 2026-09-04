import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeSeedanceFrameVideoSurface,
  decodeSeedanceReferenceVideoSurface,
  decodeSeedanceTextVideoSurface,
  seedanceComponent,
  seedanceDefinition,
  seedanceManifest,
  seedanceModuleRef,
  seedanceMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: seedanceManifest }],
  components: [seedanceComponent],
  hostFacets: [
    seedanceDefinition.hostFacet,
    ...(seedanceDefinition.runFragmentFacet === undefined ? [] : [seedanceDefinition.runFragmentFacet]),
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

export default hypitPackage;
