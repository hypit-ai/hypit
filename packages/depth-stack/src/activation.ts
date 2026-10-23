import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";

import {
  decodeDepthStackLabelSurface,
  decodeDepthStackSurface,
  depthStackComponent,
  depthStackManifest,
  depthStackModuleRef,
  depthStackMarkupSurfaces,
} from "./index.js";
import { depthStackStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: depthStackManifest,
  }],
  facets: [
    ...[depthStackComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createMarkupSurfaceFacet({
      module: depthStackModuleRef,
    declaration: depthStackMarkupSurfaces.find((item) => item.name === "label")!,
      handler: decodeDepthStackLabelSurface,
    }),
    createMarkupSurfaceFacet({
      module: depthStackModuleRef,
    declaration: depthStackMarkupSurfaces.find((item) => item.name === "track")!,
      handler: decodeDepthStackSurface,
    }),
    createStudioTrackCompanionFacet(depthStackStudioTrackCompanions),
  ],
};

export default hypitPackage;
