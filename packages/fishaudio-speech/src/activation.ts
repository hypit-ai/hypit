import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";

import {
  decodeFishAudioVoiceCloneSurface,
  decodeFishAudioVoiceDesignSurface,
  fishAudioSpeechComponent,
  fishAudioSpeechDefinition,
  fishAudioSpeechManifest,
  fishAudioSpeechMarkupSurfaces,
  fishAudioSpeechModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: fishAudioSpeechManifest }],
  facets: [
    ...[fishAudioSpeechComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createMarkupSurfaceFacet({
      module: fishAudioSpeechModuleRef,
      declaration: fishAudioSpeechMarkupSurfaces.find((item) => item.name === "voiceDesign")!,
      handler: decodeFishAudioVoiceDesignSurface,
    }),
    createMarkupSurfaceFacet({
      module: fishAudioSpeechModuleRef,
      declaration: fishAudioSpeechMarkupSurfaces.find((item) => item.name === "voiceClone")!,
      handler: decodeFishAudioVoiceCloneSurface,
    }),
  ],
};

export default hypitPackage;
