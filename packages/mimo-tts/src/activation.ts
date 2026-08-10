import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeMimoPresetSurface,
  decodeMimoVoiceCloneSurface,
  decodeMimoVoiceDesignSurface,
  mimoTtsComponent,
  mimoTtsManifest,
  mimoTtsModuleRef,
  mimoTtsSurfaceDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/mimo-tts",
  modules: [{ manifest: mimoTtsManifest, specifiers: ["@narratage/mimo-tts", "@narratage/mimo-tts@1"] }],
  components: [mimoTtsComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: mimoTtsModuleRef, surface: "preset", mode: "structured",
      implementationDigest: mimoTtsSurfaceDigests.preset, handler: decodeMimoPresetSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: mimoTtsModuleRef, surface: "voiceDesign", mode: "structured",
      implementationDigest: mimoTtsSurfaceDigests.voiceDesign, handler: decodeMimoVoiceDesignSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: mimoTtsModuleRef, surface: "voiceClone", mode: "structured",
      implementationDigest: mimoTtsSurfaceDigests.voiceClone, handler: decodeMimoVoiceCloneSurface,
    }),
  ],
};

export default svmlPackage;
