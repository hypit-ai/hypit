import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeImageTransformProgramSurface,
  decodeImageTransformSurface,
  imageTransformComponent,
  imageTransformManifest,
  imageTransformModuleRef,
  imageTransformMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: imageTransformManifest,
  }],
  components: [imageTransformComponent],
  hostFacets: [{
    ...createMarkupSurfaceHostFacet({
      module: imageTransformModuleRef,
    declaration: imageTransformMarkupSurfaces.find((item) => item.name === "program")!,
      handler: decodeImageTransformProgramSurface,
    }),
  }, {
    ...createMarkupSurfaceHostFacet({
      module: imageTransformModuleRef,
    declaration: imageTransformMarkupSurfaces.find((item) => item.name === "transform")!,
      handler: decodeImageTransformSurface,
    }),
  }],
};

export default hypitPackage;
