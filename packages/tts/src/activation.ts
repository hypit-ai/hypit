import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeVoiceCloneSurface,
  decodeVoiceDesignSurface,
  ttsComponent,
  ttsDefinition,
  ttsManifest,
  ttsMarkupSurfaces,
  ttsModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: ttsManifest }],
  components: [ttsComponent],
  hostFacets: [
    ttsDefinition.hostFacet,
    createMarkupSurfaceHostFacet({
      module: ttsModuleRef,
      declaration: ttsMarkupSurfaces.find((item) => item.name === "voiceDesign")!,
      handler: decodeVoiceDesignSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: ttsModuleRef,
      declaration: ttsMarkupSurfaces.find((item) => item.name === "voiceClone")!,
      handler: decodeVoiceCloneSurface,
    }),
  ],
};

export default hypitPackage;
