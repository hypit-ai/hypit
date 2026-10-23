import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import {
  decodeTypographyMotionSurface,
  decodeTypographyPathMotionSurface,
  decodeTypographyMaskSurface,
  decodeTypographyFlowSurface,
  decodeTypographyPointSurface,
  decodeTypographyPathSurface,
  decodeTypographyStyleSurface,
  textFineComponent,
  textFineManifest,
  textFineModuleRef,
  textFineMarkupSurfaces,
} from "./index.js";
import { textFineStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: textFineManifest }],
  facets: [
    createProducerPackageFacet(textFineComponent.producers),
    createMarkupSurfaceFacet({
      module: textFineModuleRef,
      declaration: textFineMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeTypographyStyleSurface,
    }),
    createMarkupSurfaceFacet({
      module: textFineModuleRef,
      declaration: textFineMarkupSurfaces.find((item) => item.name === "motion")!, handler: decodeTypographyMotionSurface,
    }),
    createMarkupSurfaceFacet({
      module: textFineModuleRef,
      declaration: textFineMarkupSurfaces.find((item) => item.name === "path-motion")!, handler: decodeTypographyPathMotionSurface,
    }),
    createMarkupSurfaceFacet({
      module: textFineModuleRef,
      declaration: textFineMarkupSurfaces.find((item) => item.name === "flow")!, handler: decodeTypographyFlowSurface,
    }),
    createMarkupSurfaceFacet({
      module: textFineModuleRef,
      declaration: textFineMarkupSurfaces.find((item) => item.name === "point")!, handler: decodeTypographyPointSurface,
    }),
    createMarkupSurfaceFacet({
      module: textFineModuleRef,
      declaration: textFineMarkupSurfaces.find((item) => item.name === "path")!, handler: decodeTypographyPathSurface,
    }),
    createMarkupSurfaceFacet({
      module: textFineModuleRef,
      declaration: textFineMarkupSurfaces.find((item) => item.name === "mask")!, handler: decodeTypographyMaskSurface,
    }),
    createStudioCompanionFacet({ tracks: textFineStudioTrackCompanions }),
  ],
};
export default hypitPackage;
