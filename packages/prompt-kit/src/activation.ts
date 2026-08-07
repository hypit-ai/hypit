import {
  promptKitComponent,
  promptKitManifest,
  promptKitSvsFrontend,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/prompt-kit",
  modules: [{
    manifest: promptKitManifest,
    specifiers: ["@narratage/prompt-kit", "@narratage/prompt-kit@1"],
  }],
  authorFrontends: [promptKitSvsFrontend],
  components: [promptKitComponent],
};

export default svmlPackage;
