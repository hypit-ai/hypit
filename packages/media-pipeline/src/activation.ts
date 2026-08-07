import { mediaPipelineComponent, mediaPipelineManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/media-pipeline",
  modules: [{ manifest: mediaPipelineManifest }],
  components: [mediaPipelineComponent],
};
export default svmlPackage;
