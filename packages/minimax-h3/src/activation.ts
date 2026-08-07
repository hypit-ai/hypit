import { minimaxH3Component, minimaxH3Manifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/minimax-h3", modules: [{ manifest: minimaxH3Manifest, specifiers: ["@narratage/minimax-h3", "@narratage/minimax-h3@1"] }], components: [minimaxH3Component] };
export default svmlPackage;
