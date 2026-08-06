import {
  videoContractManifests,
  videoContractsComponents,
} from "@svml/contracts";
import {
  generationComponent,
  generationManifest,
} from "@svml/generation";
import {
  captionComponent,
  captionManifest,
} from "@svml/caption";
import {
  decodeFilmSurface,
  filmManifest,
  filmModuleRef,
  filmSurfaceImplementationDigest,
} from "@svml/film";
import {
  hyperframesComponent,
  hyperframesManifest,
} from "@svml/hyperframes";
import {
  decodeHyperframesRenderSurface,
  hyperframesRenderComponent,
  hyperframesRenderManifest,
  hyperframesRenderModuleRef,
  hyperframesRenderSurfaceImplementationDigest,
} from "@svml/hyperframes-render";
import {
  mediaPipelineComponent,
  mediaPipelineManifest,
} from "@svml/media-pipeline";
import {
  decodeMediaImageSurface,
  mediaModuleRef,
  mediaSurfaceImplementationDigests,
} from "@svml/media";
import type { NodePackageActivation } from "@svml/package-loader-node";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@svml/script";
import {
  decodeSeedancePromptSurface,
  decodeSeedanceSpeechSurface,
  decodeSeedanceVideoSurface,
  seedanceComponent,
  seedanceManifest,
  seedanceModuleRef,
  seedanceSurfaceImplementationDigests,
} from "@svml/seedance";
import {
  speechAlignComponent,
  speechAlignManifest,
} from "@svml/speech-align";
import {
  speechTakeComponent,
  speechTakeManifest,
} from "@svml/speech-take";
import { svsFrontend, svsManifest } from "@svml/svs";

export const svmlPackage: NodePackageActivation = {
  format: "svml.node-package@1",
  name: "@svml/prelude-video",
  modules: [
    ...videoContractManifests.map((manifest) => ({
      manifest,
      ...(manifest.name === mediaModuleRef.name
        ? { specifiers: ["@svml/media", "@svml/media@1"] }
        : {}),
    })),
    { manifest: generationManifest },
    { manifest: seedanceManifest, specifiers: ["@svml/seedance", "@svml/seedance@1"] },
    { manifest: scriptManifest, specifiers: ["@svml/script", "@svml/script@1"] },
    { manifest: svsManifest },
    { manifest: hyperframesManifest },
    { manifest: mediaPipelineManifest },
    { manifest: captionManifest },
    { manifest: speechAlignManifest },
    { manifest: speechTakeManifest },
    { manifest: filmManifest, specifiers: ["@svml/film", "@svml/film@1"] },
    {
      manifest: hyperframesRenderManifest,
      specifiers: ["@svml/hyperframes-render", "@svml/hyperframes-render@1"],
    },
  ],
  frontends: [svsFrontend],
  components: [
    ...videoContractsComponents,
    generationComponent,
    seedanceComponent,
    captionComponent,
    mediaPipelineComponent,
    speechAlignComponent,
    speechTakeComponent,
    hyperframesComponent,
    hyperframesRenderComponent,
  ],
  textSurfaces: [
    {
      module: mediaModuleRef,
      surface: "image",
      mode: "structured",
      implementationDigest: mediaSurfaceImplementationDigests.image,
      handler: decodeMediaImageSurface,
    },
    {
      module: seedanceModuleRef,
      surface: "prompt",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.prompt,
      handler: decodeSeedancePromptSurface,
    },
    {
      module: seedanceModuleRef,
      surface: "speech",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.speech,
      handler: decodeSeedanceSpeechSurface,
    },
    {
      module: seedanceModuleRef,
      surface: "video",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.video,
      handler: decodeSeedanceVideoSurface,
    },
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

export default svmlPackage;
