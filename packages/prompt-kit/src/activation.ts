import {
  promptKitComponent,
  promptKitManifest,
  promptKitSvsFrontend,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/prompt-kit",
  modules: [{
    manifest: promptKitManifest,
    specifiers: ["@svml/prompt-kit", "@svml/prompt-kit@1"],
  }],
  authorFrontends: [promptKitSvsFrontend],
  components: [promptKitComponent],
};

export default svmlPackage;
