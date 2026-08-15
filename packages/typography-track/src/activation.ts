import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeTypographyMotionSurface,
  decodeTypographyMaskSurface,
  decodeTypographyStyleSurface,
  decodeTypographyTrackSurface,
  typographyTrackComponent,
  typographyTrackManifest,
  typographyTrackModuleRef,
  typographyTrackMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: typographyTrackManifest }],
  components: [typographyTrackComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef,
    declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeTypographyStyleSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef,
    declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "motion")!, handler: decodeTypographyMotionSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef,
    declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "track")!, handler: decodeTypographyTrackSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef,
    declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "mask")!, handler: decodeTypographyMaskSurface,
    }),
  ],
};
export default narratagePackage;
