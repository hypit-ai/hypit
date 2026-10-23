import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import {
  decodeWhisperXTranscriptionSurface, whisperXComponent,
  whisperXManifest, whisperXModuleRef,
  whisperXMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: whisperXManifest }],
  facets: [
    createProducerPackageFacet(whisperXComponent.producers), createMarkupSurfaceFacet({
    module: whisperXModuleRef,
    declaration: whisperXMarkupSurfaces.find((item) => item.name === "transcription")!,
    handler: decodeWhisperXTranscriptionSurface,
  })],
};
export default hypitPackage;
