import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import {
  grokImagineComponent,
  grokImagineDefinition,
  grokImagineManifest,
  grokImagineModuleRef,
  grokImagineMarkupSurfaces,
} from "./index.js";
import { decodeGrokImaginePreviewVideoSurface, decodeGrokImagineVideoSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: grokImagineManifest }],
  facets: [
    ...[grokImagineComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createMarkupSurfaceFacet({
      module: grokImagineModuleRef,
    declaration: grokImagineMarkupSurfaces.find((item) => item.name === "video")!,
      handler: decodeGrokImagineVideoSurface,
    }),
    createMarkupSurfaceFacet({
      module: grokImagineModuleRef,
    declaration: grokImagineMarkupSurfaces.find((item) => item.name === "preview-video")!,
      handler: decodeGrokImaginePreviewVideoSurface,
    }),
  ],
};
export default hypitPackage;
