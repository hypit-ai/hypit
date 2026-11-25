import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import {
  decodeHtmlOccludedVideoSurface,
  decodeHtmlVideoSurface, htmlVideoManifest,
  htmlVideoModuleRef,
  htmlVideoMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlVideoManifest }],
  facets: [createMarkupSurfaceFacet({
    module: htmlVideoModuleRef,
    declaration: htmlVideoMarkupSurfaces.find((item) => item.name === "video")!,
    handler: decodeHtmlVideoSurface,
  }), createMarkupSurfaceFacet({
    module: htmlVideoModuleRef,
    declaration: htmlVideoMarkupSurfaces.find((item) => item.name === "occluded-video")!,
    handler: decodeHtmlOccludedVideoSurface,
  })],
};
export default hypitPackage;
