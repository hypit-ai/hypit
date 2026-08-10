import { rasterManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/raster",
  modules: [{ manifest: rasterManifest, specifiers: ["@narratage/raster", "@narratage/raster@1"] }],
};
export default svmlPackage;
