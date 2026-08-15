import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeWhisperXAlignmentSurface, whisperXComponent,
  whisperXManifest, whisperXModuleRef,
  whisperXMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: whisperXManifest }],
  components: [whisperXComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: whisperXModuleRef,
    declaration: whisperXMarkupSurfaces.find((item) => item.name === "alignment")!,
    handler: decodeWhisperXAlignmentSurface,
  })],
};
export default narratagePackage;
