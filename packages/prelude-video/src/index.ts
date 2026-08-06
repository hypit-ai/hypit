import {
  videoContractManifests,
  videoContractsComponents,
} from "@svml/contracts";
import {
  generationComponent,
  generationManifest,
} from "@svml/generation";
import {
  brollComponent,
  brollManifest,
  brollModuleRef,
  brollSurfaceImplementationDigest,
  decodeBrollTrackSurface,
} from "@svml/broll";
import {
  captionComponent,
  captionManifest,
  captionModuleRef,
  captionProgramSurfaceImplementationDigest,
  captionSurfaceImplementationDigest,
  captionStyleSurfaceImplementationDigest,
  decodeCaptionProgramSurface,
  decodeCaptionStyleSurface,
  decodeCaptionTrackSurface,
} from "@svml/caption";
import {
  captionGeminiComponent,
  captionGeminiImplementationDigests,
  captionGeminiManifest,
  captionGeminiModuleRef,
  decodeCaptionGeminiPlannerSurface,
} from "@svml/caption-gemini";
import {
  decodeSpeechEstimateSurface,
  estimateComponent,
  estimateManifest,
  estimateModuleRef,
  estimateSurfaceImplementationDigest,
} from "@svml/estimate";
import {
  decodeFilmSurface,
  filmComponent,
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
import {
  decodeSpeechSpineSurface,
  speechProgramComponent,
  speechProgramManifest,
  speechProgramModuleRef,
  speechSpineSurfaceImplementationDigest,
} from "@svml/speech-program";
import { svsFrontend, svsManifest } from "@svml/svs";
import {
  decodeTextTrackSurface,
  textTrackComponent,
  textTrackManifest,
  textTrackModuleRef,
  textTrackSurfaceImplementationDigest,
} from "@svml/text-track";
import {
  decodeWhisperXAlignmentSurface,
  whisperXComponent,
  whisperXImplementationDigests,
  whisperXManifest,
  whisperXModuleRef,
} from "@svml/whisperx";

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
    { manifest: estimateManifest, specifiers: ["@svml/estimate", "@svml/estimate@1"] },
    { manifest: seedanceManifest, specifiers: ["@svml/seedance", "@svml/seedance@1"] },
    { manifest: scriptManifest, specifiers: ["@svml/script", "@svml/script@1"] },
    { manifest: svsManifest },
    { manifest: hyperframesManifest },
    { manifest: mediaPipelineManifest },
    { manifest: captionManifest, specifiers: ["@svml/caption", "@svml/caption@1"] },
    {
      manifest: captionGeminiManifest,
      specifiers: ["@svml/caption-gemini", "@svml/caption-gemini@1"],
    },
    { manifest: speechAlignManifest },
    { manifest: speechTakeManifest },
    { manifest: speechProgramManifest, specifiers: ["@svml/speech", "@svml/speech@1"] },
    { manifest: whisperXManifest, specifiers: ["@svml/whisperx", "@svml/whisperx@1"] },
    { manifest: textTrackManifest, specifiers: ["@svml/text-track", "@svml/text-track@1"] },
    { manifest: brollManifest, specifiers: ["@svml/broll", "@svml/broll@1"] },
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
    estimateComponent,
    seedanceComponent,
    captionComponent,
    captionGeminiComponent,
    mediaPipelineComponent,
    speechAlignComponent,
    speechTakeComponent,
    speechProgramComponent,
    whisperXComponent,
    textTrackComponent,
    brollComponent,
    filmComponent,
    hyperframesComponent,
    hyperframesRenderComponent,
  ],
  textSurfaces: [
    {
      module: estimateModuleRef,
      surface: "speech",
      mode: "structured",
      implementationDigest: estimateSurfaceImplementationDigest,
      handler: decodeSpeechEstimateSurface,
    },
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
      module: captionModuleRef,
      surface: "style",
      mode: "structured",
      implementationDigest: captionStyleSurfaceImplementationDigest,
      handler: decodeCaptionStyleSurface,
    },
    {
      module: captionModuleRef,
      surface: "program",
      mode: "structured",
      implementationDigest: captionProgramSurfaceImplementationDigest,
      handler: decodeCaptionProgramSurface,
    },
    {
      module: captionModuleRef,
      surface: "track",
      mode: "structured",
      implementationDigest: captionSurfaceImplementationDigest,
      handler: decodeCaptionTrackSurface,
    },
    {
      module: captionGeminiModuleRef,
      surface: "planner",
      mode: "structured",
      implementationDigest: captionGeminiImplementationDigests.plannerSurface,
      handler: decodeCaptionGeminiPlannerSurface,
    },
    {
      module: speechProgramModuleRef,
      surface: "spine",
      mode: "structured",
      implementationDigest: speechSpineSurfaceImplementationDigest,
      handler: decodeSpeechSpineSurface,
    },
    {
      module: whisperXModuleRef,
      surface: "alignment",
      mode: "structured",
      implementationDigest: whisperXImplementationDigests.surface,
      handler: decodeWhisperXAlignmentSurface,
    },
    {
      module: brollModuleRef,
      surface: "track",
      mode: "structured",
      implementationDigest: brollSurfaceImplementationDigest,
      handler: decodeBrollTrackSurface,
    },
    {
      module: textTrackModuleRef,
      surface: "track",
      mode: "structured",
      implementationDigest: textTrackSurfaceImplementationDigest,
      handler: decodeTextTrackSurface,
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
