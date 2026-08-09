import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  audioTrackComponent,
  audioTrackManifest,
  audioTrackModuleRef,
  audioTrackSurfaceImplementationDigest,
  decodeAudioTrackSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/audio-track",
  modules: [{ manifest: audioTrackManifest, specifiers: [audioTrackModuleRef.name, `${audioTrackModuleRef.name}@1`] }],
  components: [audioTrackComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: audioTrackModuleRef,
    surface: "track",
    mode: "structured",
    implementationDigest: audioTrackSurfaceImplementationDigest,
    handler: decodeAudioTrackSurface,
  })],
};
export default svmlPackage;
