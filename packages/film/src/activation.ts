import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeFilmSurface, filmComponent, filmManifest, filmModuleRef, filmSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/film",
  modules: [{ manifest: filmManifest, specifiers: ["@narratage/film", "@narratage/film@1"] }],
  components: [filmComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: filmModuleRef, surface: "film", mode: "structured",
    implementationDigest: filmSurfaceImplementationDigest, handler: decodeFilmSurface,
  })],
};
export default svmlPackage;
