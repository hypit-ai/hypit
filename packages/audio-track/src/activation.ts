import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import {
  audioTrackComponent,
  audioTrackManifest,
  audioTrackModuleRef,
  decodeAudioTrackSurface,
  decodeAudioSourceTimeSurface,
  audioTrackMarkupSurfaces,
} from "./index.js";
import { audioTrackStudioParameterCompanions, audioTrackStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audioTrackManifest }],
  facets: [
    ...[audioTrackComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),
    createMarkupSurfaceFacet({
      module: audioTrackModuleRef,
      declaration: audioTrackMarkupSurfaces.find((item) => item.name === "track")!,
      handler: decodeAudioTrackSurface,
    }),
    createMarkupSurfaceFacet({
      module: audioTrackModuleRef,
      declaration: audioTrackMarkupSurfaces.find((item) => item.name === "source-time")!,
      handler: decodeAudioSourceTimeSurface,
    }),
    createStudioCompanionFacet({
      tracks: audioTrackStudioTrackCompanions,
      parameters: audioTrackStudioParameterCompanions,
    }),
  ],
};
export default hypitPackage;
