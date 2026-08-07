import { speechManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/speech", modules: [{ manifest: speechManifest }] };
export default svmlPackage;
