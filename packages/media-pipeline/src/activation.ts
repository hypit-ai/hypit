import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import { createRunFragmentHostFacet } from "@hypit/run";
import {
  decodeSynchronizedMediaSurface,
  decodeStillVideoSurface,
  decodeExtractAudioSurface,
  decodeExtractFrameSurface,
  decodeTransformMediaSurface,
  mediaPipelineComponent,
  mediaPipelineManifest,
  mediaPipelineModuleRef,
  mediaPipelineMarkupSurfaces,
  stillVideoFragment,
  clipTimeStillVideoFragment,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: mediaPipelineManifest }],
  components: [mediaPipelineComponent],
  hostFacets: [createRunFragmentHostFacet({
    name: "@hypit/media-pipeline@1",
    fragments: {
      "still-video": stillVideoFragment,
      "clip-time-still-video": clipTimeStillVideoFragment,
    },
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    declaration: mediaPipelineMarkupSurfaces.find((item) => item.name === "synchronized-media")!,
    handler: decodeSynchronizedMediaSurface,
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    declaration: mediaPipelineMarkupSurfaces.find((item) => item.name === "still-video")!,
    handler: decodeStillVideoSurface,
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    declaration: mediaPipelineMarkupSurfaces.find((item) => item.name === "transform-media")!,
    handler: decodeTransformMediaSurface,
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    declaration: mediaPipelineMarkupSurfaces.find((item) => item.name === "extract-audio")!,
    handler: decodeExtractAudioSurface,
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    declaration: mediaPipelineMarkupSurfaces.find((item) => item.name === "extract-frame")!,
    handler: decodeExtractFrameSurface,
  })],
};
export default hypitPackage;
