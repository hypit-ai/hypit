import { createTextSurfaceHostFacet } from "@narratage/text";

import {
  decodeImageTransformProgramSurface,
  decodeImageTransformSurface,
  imageTransformComponent,
  imageTransformImplementationDigests,
  imageTransformManifest,
  imageTransformModuleRef,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/image-transform",
  modules: [{
    manifest: imageTransformManifest,
    specifiers: ["@narratage/image-transform", "@narratage/image-transform@1"],
  }],
  components: [imageTransformComponent],
  hostFacets: [{
    ...createTextSurfaceHostFacet({
      module: imageTransformModuleRef,
      surface: "program",
      mode: "structured",
      implementationDigest: imageTransformImplementationDigests.programSurface,
      handler: decodeImageTransformProgramSurface,
    }),
  }, {
    ...createTextSurfaceHostFacet({
      module: imageTransformModuleRef,
      surface: "transform",
      mode: "structured",
      implementationDigest: imageTransformImplementationDigests.transformSurface,
      handler: decodeImageTransformSurface,
    }),
  }],
};

export default svmlPackage;
