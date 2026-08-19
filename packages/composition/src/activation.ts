import { compositionComponent, compositionManifest } from "./index.js";
export const hypitPackage = { format: "hypit.node-package@1" as const, modules: [{ manifest: compositionManifest }], components: [compositionComponent] };
export default hypitPackage;
