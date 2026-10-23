import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";

import {
  decodeImageComposeSurface,
  decodeImageTransformProgramSurface,
  decodeImageTransformSurface,
  imageComposeComponent,
  imageTransformComponent,
  imageOperationsManifest,
  imageOperationsModuleRef,
  imageOperationsMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: imageOperationsManifest,
  }],
  facets: [
    ...[imageTransformComponent, imageComposeComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),{
    ...createMarkupSurfaceFacet({
      module: imageOperationsModuleRef,
      declaration: imageOperationsMarkupSurfaces.find((item) => item.name === "program")!,
      handler: decodeImageTransformProgramSurface,
    }),
  }, {
    ...createMarkupSurfaceFacet({
      module: imageOperationsModuleRef,
      declaration: imageOperationsMarkupSurfaces.find((item) => item.name === "transform")!,
      handler: decodeImageTransformSurface,
    }),
  }, {
    ...createMarkupSurfaceFacet({
      module: imageOperationsModuleRef,
      declaration: imageOperationsMarkupSurfaces.find((item) => item.name === "compose")!,
      handler: decodeImageComposeSurface,
    }),
  }],
};

export default hypitPackage;
