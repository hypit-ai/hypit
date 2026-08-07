import { gptImageComponent, gptImageManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/gpt-image", modules: [{ manifest: gptImageManifest, specifiers: ["@narratage/gpt-image", "@narratage/gpt-image@1"] }], components: [gptImageComponent] };
export default svmlPackage;
