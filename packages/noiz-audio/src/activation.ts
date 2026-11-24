import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  decodeNoizMusicCoverSurface,
  decodeNoizMusicSurface,
  decodeNoizSoundEffectSurface,
  noizAudioComponent,
  noizAudioDefinition,
  noizAudioManifest,
  noizAudioMarkupSurfaces,
  noizAudioModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: noizAudioManifest }],
  facets: [
    createProducerPackageFacet(noizAudioComponent),
    createAdmissionPackageFacet(noizAudioComponent),
    noizAudioDefinition.facet,
    createMarkupSurfaceFacet({
      module: noizAudioModuleRef,
      declaration: noizAudioMarkupSurfaces.find((item) => item.name === "sound-effect")!,
      handler: decodeNoizSoundEffectSurface,
    }),
    createMarkupSurfaceFacet({
      module: noizAudioModuleRef,
      declaration: noizAudioMarkupSurfaces.find((item) => item.name === "music")!,
      handler: decodeNoizMusicSurface,
    }),
    createMarkupSurfaceFacet({
      module: noizAudioModuleRef,
      declaration: noizAudioMarkupSurfaces.find((item) => item.name === "music-cover")!,
      handler: decodeNoizMusicCoverSurface,
    }),
  ],
};

export default hypitPackage;
