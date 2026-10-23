import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";

import {
  decodeMediaAudioSurface, decodeMediaFontStackSurface, decodeMediaFontSurface, decodeMediaImageSurface, decodeMediaVideoSurface, mediaComponent,
  mediaManifest,
  mediaModuleRef,
  mediaMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaManifest }],
  facets: [
    ...[mediaComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createMarkupSurfaceFacet({
      module: mediaModuleRef,
    declaration: mediaMarkupSurfaces.find((item) => item.name === "image")!,
      handler: decodeMediaImageSurface,
    }),
    createMarkupSurfaceFacet({
      module: mediaModuleRef,
    declaration: mediaMarkupSurfaces.find((item) => item.name === "audio")!,
      handler: decodeMediaAudioSurface,
    }),
    createMarkupSurfaceFacet({
      module: mediaModuleRef,
    declaration: mediaMarkupSurfaces.find((item) => item.name === "video")!,
      handler: decodeMediaVideoSurface,
    }),
    createMarkupSurfaceFacet({
      module: mediaModuleRef,
    declaration: mediaMarkupSurfaces.find((item) => item.name === "font")!,
      handler: decodeMediaFontSurface,
    }),
    createMarkupSurfaceFacet({
      module: mediaModuleRef,
      declaration: mediaMarkupSurfaces.find((item) => item.name === "font-stack")!,
      handler: decodeMediaFontStackSurface,
    }),
  ],
};

export default hypitPackage;
