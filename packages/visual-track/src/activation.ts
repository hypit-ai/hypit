import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import {
  decodeVisualTrackSurface,
  decodeVisualMotionSurface,
  decodeVisualSourceTimeSurface,
  visualTrackComponent,
  visualTrackManifest,
  visualTrackModuleRef,
  visualTrackMarkupSurfaces,
} from "./index.js";
import { visualTrackStudioParameterCompanions, visualTrackStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualTrackManifest }],
  facets: [
    ...[visualTrackComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),
    createMarkupSurfaceFacet({
      module: visualTrackModuleRef,
      declaration: visualTrackMarkupSurfaces.find((item) => item.name === "track")!,
      handler: decodeVisualTrackSurface,
    }),
    createMarkupSurfaceFacet({
      module: visualTrackModuleRef,
      declaration: visualTrackMarkupSurfaces.find((item) => item.name === "motion")!,
      handler: decodeVisualMotionSurface,
    }),
    createMarkupSurfaceFacet({
      module: visualTrackModuleRef,
      declaration: visualTrackMarkupSurfaces.find((item) => item.name === "source-time")!,
      handler: decodeVisualSourceTimeSurface,
    }),
    createStudioCompanionFacet({
      tracks: visualTrackStudioTrackCompanions,
      parameters: visualTrackStudioParameterCompanions,
    }),
  ],
};
export default hypitPackage;
