import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import { seedreamComponent, seedreamManifest, seedreamModuleRef, seedreamSurfaceImplementationDigests } from "./index.js";
import { decodeSeedreamReferenceImageSurface, decodeSeedreamTextImageSurface } from "./surface.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/seedream", modules: [{ manifest: seedreamManifest, specifiers: ["@narratage/seedream", "@narratage/seedream@1"] }], components: [seedreamComponent], hostFacets: [
  createMarkupSurfaceHostFacet({ module: seedreamModuleRef, surface: "text-image", mode: "structured", implementationDigest: seedreamSurfaceImplementationDigests.textImage, handler: decodeSeedreamTextImageSurface }),
  createMarkupSurfaceHostFacet({ module: seedreamModuleRef, surface: "reference-image", mode: "structured", implementationDigest: seedreamSurfaceImplementationDigests.referenceImage, handler: decodeSeedreamReferenceImageSurface }),
] };
export default svmlPackage;
