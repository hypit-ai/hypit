import { svsFrontend, svsManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/svs",
  modules: [{ manifest: svsManifest }],
  authorFrontends: [svsFrontend],
};

export default svmlPackage;
