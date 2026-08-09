import { mediaTrackComponent, mediaTrackManifest, mediaTrackModuleRef } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/media-track",
  modules: [{ manifest: mediaTrackManifest, specifiers: [mediaTrackModuleRef.name, `${mediaTrackModuleRef.name}@1`] }],
  components: [mediaTrackComponent],
};
export default svmlPackage;
