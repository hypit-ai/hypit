import { createTextSurfaceHostFacet } from "@narratage/text";

import {
  decodeColumnStyleSurface,
  decodeColumnSurface,
  decodeTierBoardStyleSurface,
  decodeTierBoardSurface,
  decodeTopThreeStyleSurface,
  decodeTopThreeSurface,
  decodeTypewriterListStyleSurface,
  decodeTypewriterListSurface,
  rankingComponent,
  rankingManifest,
  rankingModuleRef,
  rankingSurfaceImplementationDigests,
} from "./index.js";

const facets = [
  ["tier-style", rankingSurfaceImplementationDigests.tierStyle, decodeTierBoardStyleSurface],
  ["column-style", rankingSurfaceImplementationDigests.columnStyle, decodeColumnStyleSurface],
  ["top-three-style", rankingSurfaceImplementationDigests.topThreeStyle, decodeTopThreeStyleSurface],
  ["typewriter-style", rankingSurfaceImplementationDigests.typewriterStyle, decodeTypewriterListStyleSurface],
  ["tier", rankingSurfaceImplementationDigests.tier, decodeTierBoardSurface],
  ["column", rankingSurfaceImplementationDigests.column, decodeColumnSurface],
  ["top-three", rankingSurfaceImplementationDigests.topThree, decodeTopThreeSurface],
  ["typewriter", rankingSurfaceImplementationDigests.typewriter, decodeTypewriterListSurface],
] as const;

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/ranking",
  modules: [{
    manifest: rankingManifest,
    specifiers: [rankingModuleRef.name, `${rankingModuleRef.name}@1`],
  }],
  components: [rankingComponent],
  hostFacets: facets.map(([surface, implementationDigest, handler]) => createTextSurfaceHostFacet({
    module: rankingModuleRef,
    surface,
    mode: "structured",
    implementationDigest,
    handler,
  })),
};

export default svmlPackage;
