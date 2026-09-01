import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeMimoVoiceDesignSurface,
  mimoTtsComponent,
  mimoTtsDefinition,
  mimoTtsManifest,
  mimoTtsModuleRef,
  mimoTtsMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: mimoTtsManifest }],
  components: [mimoTtsComponent],
  hostFacets: [
    mimoTtsDefinition.hostFacet,
    createMarkupSurfaceHostFacet({
      module: mimoTtsModuleRef,
    declaration: mimoTtsMarkupSurfaces.find((item) => item.name === "voiceDesign")!, handler: decodeMimoVoiceDesignSurface,
    }),
  ],
};

export default hypitPackage;
