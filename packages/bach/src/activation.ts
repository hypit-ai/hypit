import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { bachComponent, bachDefinition, bachManifest, bachModuleRef, bachMarkupSurfaces } from "./index.js";
import { decodeBachFrameVideoSurface, decodeBachReferenceVideoSurface, decodeBachTextVideoSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: bachManifest }],
  facets: [
    createProducerPackageFacet(bachComponent),
    createAdmissionPackageFacet(bachComponent),
    bachDefinition.facet,
    createMarkupSurfaceFacet({
      module: bachModuleRef,
      declaration: bachMarkupSurfaces.find((item) => item.name === "text-video")!,
      handler: decodeBachTextVideoSurface,
    }),
    createMarkupSurfaceFacet({
      module: bachModuleRef,
      declaration: bachMarkupSurfaces.find((item) => item.name === "frame-video")!,
      handler: decodeBachFrameVideoSurface,
    }),
    createMarkupSurfaceFacet({
      module: bachModuleRef,
      declaration: bachMarkupSurfaces.find((item) => item.name === "reference-video")!,
      handler: decodeBachReferenceVideoSurface,
    }),
  ],
};
export default hypitPackage;
