import { compositionComponent, compositionManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, modules: [{ manifest: compositionManifest }], components: [compositionComponent] };
export default svmlPackage;
