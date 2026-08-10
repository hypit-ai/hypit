import { gptImageCleanManifest, gptImageComponent, gptImageManifest } from "./index.js";
export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/gpt-image",
  modules: [{
    manifest: gptImageManifest,
    specifiers: ["@narratage/gpt-image", "@narratage/gpt-image@1"],
  }, {
    manifest: gptImageCleanManifest,
    specifiers: ["@narratage/gpt-image/clean", "@narratage/gpt-image/clean@1"],
  }],
  components: [gptImageComponent],
};
export default svmlPackage;
