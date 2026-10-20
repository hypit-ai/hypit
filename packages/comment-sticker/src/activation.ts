import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";

import {
  commentStickerComponent,
  commentStickerManifest,
  commentStickerModuleRef,
  decodeCommentStickerStyleSurface,
  decodeCommentStickerTrackSurface,
  commentStickerMarkupSurfaces,
} from "./index.js";
import { commentStickerStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: commentStickerManifest,
  }],
  facets: [
    ...[commentStickerComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),
    createMarkupSurfaceFacet({
      module: commentStickerModuleRef,
    declaration: commentStickerMarkupSurfaces.find((item) => item.name === "style")!,
      handler: decodeCommentStickerStyleSurface,
    }),
    createMarkupSurfaceFacet({
      module: commentStickerModuleRef,
    declaration: commentStickerMarkupSurfaces.find((item) => item.name === "track")!,
      handler: decodeCommentStickerTrackSurface,
    }),
    createStudioTrackCompanionFacet(commentStickerStudioTrackCompanions),
  ],
};

export default hypitPackage;
