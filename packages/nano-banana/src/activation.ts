import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  nanoBananaComponent, nanoBananaManifest, nanoBananaModuleRef, nanoBananaSurfaceImplementationDigests,
} from "./index.js";
import { decodeNanoBananaImageSurface, decodeNanoBananaProImageSurface } from "./surface.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/nano-banana", modules: [{ manifest: nanoBananaManifest, specifiers: ["@narratage/nano-banana", "@narratage/nano-banana@1"] }], components: [nanoBananaComponent], hostFacets: [
  createMarkupSurfaceHostFacet({ module: nanoBananaModuleRef, surface: "image", mode: "structured", implementationDigest: nanoBananaSurfaceImplementationDigests.image, handler: decodeNanoBananaImageSurface }),
  createMarkupSurfaceHostFacet({ module: nanoBananaModuleRef, surface: "pro-image", mode: "structured", implementationDigest: nanoBananaSurfaceImplementationDigests.proImage, handler: decodeNanoBananaProImageSurface }),
] };
export default svmlPackage;
