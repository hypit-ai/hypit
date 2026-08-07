import { seedreamComponent, seedreamManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/seedream", modules: [{ manifest: seedreamManifest, specifiers: ["@narratage/seedream", "@narratage/seedream@1"] }], components: [seedreamComponent] };
export default svmlPackage;
