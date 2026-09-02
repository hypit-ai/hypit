import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import { emojiRevealComponent, emojiRevealManifest, emojiRevealMarkupSurfaces, emojiRevealModuleRef } from "./index.js";
import { decodeEmojiRevealStyleSurface, decodeEmojiRevealTrackSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: emojiRevealManifest }], components: [emojiRevealComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({ module: emojiRevealModuleRef, declaration: emojiRevealMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeEmojiRevealStyleSurface }),
    createMarkupSurfaceHostFacet({ module: emojiRevealModuleRef, declaration: emojiRevealMarkupSurfaces.find((item) => item.name === "track")!, handler: decodeEmojiRevealTrackSurface }),
  ],
};
export default hypitPackage;
