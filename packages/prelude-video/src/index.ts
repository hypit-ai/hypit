import { videoContractManifests } from "@svml/contracts";
import {
  decodeFilmSurface,
  filmManifest,
  filmModuleRef,
  filmSurfaceImplementationDigest,
} from "@svml/film";
import { hyperframesManifest } from "@svml/hyperframes";
import {
  decodeHyperframesRenderSurface,
  hyperframesRenderManifest,
  hyperframesRenderModuleRef,
  hyperframesRenderSurfaceImplementationDigest,
} from "@svml/hyperframes-render";
import { mediaPipelineManifest } from "@svml/media-pipeline";
import type { NodeAuthorPackage } from "@svml/package-loader-node";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@svml/script";
import { svsFrontend, svsManifest } from "@svml/svs";

export const svmlAuthorPackage: NodeAuthorPackage = {
  format: "svml.node-author-package@1",
  name: "@svml/prelude-video",
  modules: [
    ...videoContractManifests.map((manifest) => ({ manifest })),
    { manifest: scriptManifest, specifiers: ["@svml/script", "@svml/script@1"] },
    { manifest: svsManifest },
    { manifest: hyperframesManifest },
    { manifest: mediaPipelineManifest },
    { manifest: filmManifest, specifiers: ["@svml/film", "@svml/film@1"] },
    {
      manifest: hyperframesRenderManifest,
      specifiers: ["@svml/hyperframes-render", "@svml/hyperframes-render@1"],
    },
  ],
  frontends: [svsFrontend],
  textSurfaces: [
    {
      module: scriptModuleRef,
      surface: "script",
      mode: "raw",
      implementationDigest: scriptSurfaceImplementationDigest,
      handler: decodeScriptSurface,
    },
    {
      module: filmModuleRef,
      surface: "film",
      mode: "structured",
      implementationDigest: filmSurfaceImplementationDigest,
      handler: decodeFilmSurface,
    },
    {
      module: hyperframesRenderModuleRef,
      surface: "video",
      mode: "structured",
      implementationDigest: hyperframesRenderSurfaceImplementationDigest,
      handler: decodeHyperframesRenderSurface,
    },
  ],
};

export default svmlAuthorPackage;
