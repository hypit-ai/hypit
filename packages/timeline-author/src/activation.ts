import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import {
  decodeAbsoluteInstantSurface, decodeAbsoluteWindowSurface, decodeClockSurface, decodeTimelineAuthorSurface, timelineAuthorComponent, timelineAuthorManifest,
  timelineAuthorModuleRef,
  timelineAuthorMarkupSurfaces,
} from "./index.js";
import { timelineAuthorStudioTemporalDeclarations, timelineAuthorStudioTemporalRelations } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: timelineAuthorManifest,
  }],
  facets: [
    createStudioCompanionFacet({
      temporalDeclarations: timelineAuthorStudioTemporalDeclarations,
      temporalRelations: timelineAuthorStudioTemporalRelations,
    }),
    createProducerPackageFacet(timelineAuthorComponent.producers), createMarkupSurfaceFacet({
    module: timelineAuthorModuleRef,
    declaration: timelineAuthorMarkupSurfaces.find((item) => item.name === "timeline")!, handler: decodeTimelineAuthorSurface,
  }), createMarkupSurfaceFacet({ module: timelineAuthorModuleRef,
    declaration: timelineAuthorMarkupSurfaces.find(item => item.name === "clock")!, handler: decodeClockSurface,
  }), createMarkupSurfaceFacet({ module: timelineAuthorModuleRef,
    declaration: timelineAuthorMarkupSurfaces.find(item => item.name === "window")!, handler: decodeAbsoluteWindowSurface,
  }), createMarkupSurfaceFacet({ module: timelineAuthorModuleRef,
    declaration: timelineAuthorMarkupSurfaces.find(item => item.name === "instant")!, handler: decodeAbsoluteInstantSurface,
  })],
};
export default hypitPackage;
