import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";

import {
  captionFineComponent,
  captionFineManifest,
  captionFineModuleRef,
  decodeFineCaptionStyleSurface,
  decodeFineCaptionTrackSurface,
  captionFineMarkupSurfaces,
} from "./index.js";
import { captionFineStudioParameterCompanions, captionFineStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: captionFineManifest,
  }],
  facets: [
    createProducerPackageFacet(captionFineComponent.producers),
    createMarkupSurfaceFacet({
      module: captionFineModuleRef,
      declaration: captionFineMarkupSurfaces.find((item) => item.name === "style")!,
      handler: decodeFineCaptionStyleSurface,
    }),
    createMarkupSurfaceFacet({
      module: captionFineModuleRef,
      declaration: captionFineMarkupSurfaces.find((item) => item.name === "caption")!,
      handler: decodeFineCaptionTrackSurface,
    }),
    createStudioCompanionFacet({
      tracks: captionFineStudioTrackCompanions,
      parameters: captionFineStudioParameterCompanions,
    }),
  ],
};

export default hypitPackage;
