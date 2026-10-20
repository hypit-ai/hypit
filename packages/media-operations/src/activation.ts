import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRunFragmentFacet } from "@hypit/hypit/run";
import {
  decodeSynchronizedMediaSurface,
  decodeStillVideoSurface,
  decodeExtractAudioSurface,
  decodeExtractFrameSurface,
  decodeTransformMediaSurface,
  mediaOperationsComponent,
  mediaOperationsManifest,
  mediaOperationsModuleRef,
  mediaOperationsMarkupSurfaces,
  stillVideoFragment,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaOperationsManifest }],
  facets: [
    ...[mediaOperationsComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),createRunFragmentFacet({
    name: "@hypit/media-operations@1",
    fragments: {
      "still-video": stillVideoFragment,
    },
  }), createMarkupSurfaceFacet({
    module: mediaOperationsModuleRef,
    declaration: mediaOperationsMarkupSurfaces.find((item) => item.name === "synchronized-media")!,
    handler: decodeSynchronizedMediaSurface,
  }), createMarkupSurfaceFacet({
    module: mediaOperationsModuleRef,
    declaration: mediaOperationsMarkupSurfaces.find((item) => item.name === "still-video")!,
    handler: decodeStillVideoSurface,
  }), createMarkupSurfaceFacet({
    module: mediaOperationsModuleRef,
    declaration: mediaOperationsMarkupSurfaces.find((item) => item.name === "transform-media")!,
    handler: decodeTransformMediaSurface,
  }), createMarkupSurfaceFacet({
    module: mediaOperationsModuleRef,
    declaration: mediaOperationsMarkupSurfaces.find((item) => item.name === "extract-audio")!,
    handler: decodeExtractAudioSurface,
  }), createMarkupSurfaceFacet({
    module: mediaOperationsModuleRef,
    declaration: mediaOperationsMarkupSurfaces.find((item) => item.name === "extract-frame")!,
    handler: decodeExtractFrameSurface,
  })],
};
export default hypitPackage;
