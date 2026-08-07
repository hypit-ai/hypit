import { createTextSurfaceHostFacet } from "@svml/text";

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
  name: "@svml/image-transform",
  modules: [{
    manifest: imageTransformManifest,
    specifiers: ["@svml/image-transform", "@svml/image-transform@1"],
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
