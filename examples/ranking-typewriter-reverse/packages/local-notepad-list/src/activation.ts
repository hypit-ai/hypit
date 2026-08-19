import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeNotepadListSurface,
  decodeNotepadStyleSurface,
  notepadComponent,
  notepadManifest,
  notepadMarkupSurfaces,
  notepadModuleRef,
} from "./index.js";

const facets = [
  ["notepad-style", decodeNotepadStyleSurface],
  ["notepad-list", decodeNotepadListSurface],
] as const;

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: notepadManifest }],
  components: [notepadComponent],
  hostFacets: facets.map(([surface, handler]) => createMarkupSurfaceHostFacet({
    module: notepadModuleRef,
    declaration: notepadMarkupSurfaces.find((item) => item.name === surface)!,
    handler,
  })),
};

export default hypitPackage;
