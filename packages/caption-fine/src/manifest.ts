import { captionManifest, captionModuleRef, captionTypes } from "@narratage/caption";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { semanticMapDependency } from "@narratage/semantic-map";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef } from "@narratage/protocol";

import { renderFineCaptionImplementationDigest } from "./render.js";

export const captionFineModuleRef = { name: "@narratage/caption-fine", version: "0.0.0-dev" } as const;
export const captionFineProducers = {
  render: { module: captionFineModuleRef, name: "render-fine-caption" },
} satisfies Record<string, ProducerRef>;
export const captionFineStyleSurfaceImplementationDigest = digestOf("@narratage/caption-fine/style-surface@1");
export const captionFineTrackSurfaceImplementationDigest = digestOf("@narratage/caption-fine/track-surface@1");

export const captionFineManifest: ModuleManifest = {
  format: "svml.module@1",
  name: captionFineModuleRef.name,
  version: captionFineModuleRef.version,
  dependencies: [
    { module: captionModuleRef, digest: digestOf(captionManifest) },
    compositionDependency,
    narrativeDependency,
    programSpaceDependency,
    semanticMapDependency,
  ],
  types: [],
  capabilities: [],
  surfaces: [
    {
      name: "style", tag: "Style", mode: "structured", outputs: [captionTypes.style],
      implementation: { kind: "trusted-frontend-surface", locator: "@narratage/caption-fine/style-surface",
        digest: captionFineStyleSurfaceImplementationDigest },
    },
    {
      name: "track", tag: "Track", mode: "structured", outputs: [compositionTypes.visualTrack],
      implementation: { kind: "trusted-frontend-surface", locator: "@narratage/caption-fine/track-surface",
        digest: captionFineTrackSurfaceImplementationDigest },
    },
  ],
  producers: [{
    name: captionFineProducers.render.name,
    inputs: [
      { name: "caption", type: captionTypes.timedProjection },
      { name: "program", type: captionTypes.program },
      { name: "words", type: narrativeTypes.captionWordSequence },
      { name: "space", type: programSpaceTypes.programSpace },
    ],
    outputs: [{ name: "track", type: compositionTypes.visualTrack }],
    needs: [],
    implementation: { kind: "registered", locator: "@narratage/caption-fine/render",
      digest: renderFineCaptionImplementationDigest },
  }],
};
