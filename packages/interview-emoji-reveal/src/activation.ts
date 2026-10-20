import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";

import { emojiRevealComponent, emojiRevealManifest, emojiRevealMarkupSurfaces, emojiRevealModuleRef } from "./index.js";
import { decodeEmojiRevealStyleSurface, decodeEmojiRevealTrackSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: emojiRevealManifest }],
  facets: [
    createProducerPackageFacet(emojiRevealComponent),
    createRefinementPackageFacet(emojiRevealComponent),
    createMarkupSurfaceFacet({ module: emojiRevealModuleRef, declaration: emojiRevealMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeEmojiRevealStyleSurface }),
    createMarkupSurfaceFacet({ module: emojiRevealModuleRef, declaration: emojiRevealMarkupSurfaces.find((item) => item.name === "emojiReveal")!, handler: decodeEmojiRevealTrackSurface }),
  ],
};
export default hypitPackage;
