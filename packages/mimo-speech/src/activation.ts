import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeMimoVoiceCloneSurface,
  decodeMimoVoiceDesignSurface,
  mimoSpeechComponent,
  mimoSpeechDefinition,
  mimoSpeechManifest,
  mimoSpeechMarkupSurfaces,
  mimoSpeechModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: mimoSpeechManifest }],
  components: [mimoSpeechComponent],
  hostFacets: [
    mimoSpeechDefinition.hostFacet,
    createMarkupSurfaceHostFacet({
      module: mimoSpeechModuleRef,
      declaration: mimoSpeechMarkupSurfaces.find((item) => item.name === "voiceDesign")!,
      handler: decodeMimoVoiceDesignSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: mimoSpeechModuleRef,
      declaration: mimoSpeechMarkupSurfaces.find((item) => item.name === "voiceClone")!,
      handler: decodeMimoVoiceCloneSurface,
    }),
  ],
};

export default hypitPackage;
