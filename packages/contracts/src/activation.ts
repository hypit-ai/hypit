import {
  compositionManifest,
  narrativeManifest,
  programSpaceManifest,
  semanticTimeManifest,
  speechManifest,
  compositionContractsComponent,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/contracts",
  modules: [
    { manifest: narrativeManifest },
    { manifest: programSpaceManifest },
    { manifest: speechManifest },
    { manifest: semanticTimeManifest },
    { manifest: compositionManifest },
  ],
  components: [compositionContractsComponent],
};

export default svmlPackage;
