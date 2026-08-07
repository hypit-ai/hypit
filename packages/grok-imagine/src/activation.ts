import { grokImagineComponent, grokImagineManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/grok-imagine", modules: [{ manifest: grokImagineManifest, specifiers: ["@narratage/grok-imagine", "@narratage/grok-imagine@1"] }], components: [grokImagineComponent] };
export default svmlPackage;
