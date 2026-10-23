import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";

import {
  decodeSeedanceFrameVideoSurface,
  decodeSeedanceReferenceVideoSurface,
  decodeSeedanceTextVideoSurface,
  seedanceComponent,
  seedanceDefinition,
  seedanceManifest,
  seedanceModuleRef,
  seedanceMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: seedanceManifest }],
  facets: [
    ...[seedanceComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createMarkupSurfaceFacet({
      module: seedanceModuleRef,
    declaration: seedanceMarkupSurfaces.find((item) => item.name === "text-video")!,
      handler: decodeSeedanceTextVideoSurface,
    }),
    createMarkupSurfaceFacet({
      module: seedanceModuleRef,
    declaration: seedanceMarkupSurfaces.find((item) => item.name === "frame-video")!,
      handler: decodeSeedanceFrameVideoSurface,
    }),
    createMarkupSurfaceFacet({
      module: seedanceModuleRef,
    declaration: seedanceMarkupSurfaces.find((item) => item.name === "reference-video")!,
      handler: decodeSeedanceReferenceVideoSurface,
    }),
  ],
};

export default hypitPackage;
