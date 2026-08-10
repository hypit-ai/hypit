import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  commentStickerComponent,
  commentStickerManifest,
  commentStickerModuleRef,
  commentStickerStyleSurfaceImplementationDigest,
  commentStickerTrackSurfaceImplementationDigest,
  decodeCommentStickerStyleSurface,
  decodeCommentStickerTrackSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/comment-sticker",
  modules: [{
    manifest: commentStickerManifest,
    specifiers: [commentStickerModuleRef.name, `${commentStickerModuleRef.name}@1`],
  }],
  components: [commentStickerComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: commentStickerModuleRef,
      surface: "style",
      mode: "structured",
      implementationDigest: commentStickerStyleSurfaceImplementationDigest,
      handler: decodeCommentStickerStyleSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: commentStickerModuleRef,
      surface: "track",
      mode: "structured",
      implementationDigest: commentStickerTrackSurfaceImplementationDigest,
      handler: decodeCommentStickerTrackSurface,
    }),
  ],
};

export default svmlPackage;
