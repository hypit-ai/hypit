import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeElevenLabsVoiceDesignSurface,
  elevenLabsSpeechComponent,
  elevenLabsSpeechDefinition,
  elevenLabsSpeechManifest,
  elevenLabsSpeechMarkupSurfaces,
  elevenLabsSpeechModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: elevenLabsSpeechManifest }],
  components: [elevenLabsSpeechComponent],
  hostFacets: [
    elevenLabsSpeechDefinition.hostFacet,
    createMarkupSurfaceHostFacet({
      module: elevenLabsSpeechModuleRef,
      declaration: elevenLabsSpeechMarkupSurfaces.find((item) => item.name === "voiceDesign")!,
      handler: decodeElevenLabsVoiceDesignSurface,
    }),
  ],
};

export default hypitPackage;
