import { compositionComponent, compositionManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/composition", modules: [{ manifest: compositionManifest }], components: [compositionComponent] };
export default svmlPackage;
