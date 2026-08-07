import { nanoBananaComponent, nanoBananaManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/nano-banana", modules: [{ manifest: nanoBananaManifest, specifiers: ["@narratage/nano-banana", "@narratage/nano-banana@1"] }], components: [nanoBananaComponent] };
export default svmlPackage;
