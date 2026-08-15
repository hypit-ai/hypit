import { compositionComponent, compositionManifest } from "./index.js";
export const narratagePackage = { format: "narratage.node-package@1" as const, modules: [{ manifest: compositionManifest }], components: [compositionComponent] };
export default narratagePackage;
