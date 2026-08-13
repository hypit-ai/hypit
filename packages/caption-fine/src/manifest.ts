import { captionManifest, captionModuleRef, captionTypes } from "@narratage/caption";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { mediaDependency } from "@narratage/media";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { semanticMapDependency } from "@narratage/semantic-map";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef } from "@narratage/protocol";

import { renderFineCaptionImplementationDigest } from "./render.js";

export const captionFineModuleRef = { name: "@narratage/caption-fine", version: "1" } as const;
export const captionFineProducers = {
  render: { module: captionFineModuleRef, name: "render-fine-caption" },
} satisfies Record<string, ProducerRef>;
export const captionFineStyleSurfaceImplementationDigest = digestOf("@narratage/caption-fine/full-orthogonal-style-surface@1");
export const captionFineTrackSurfaceImplementationDigest = digestOf("@narratage/caption-fine/full-orthogonal-track-surface@1");

export const captionFineMarkupSurfaces = [
    {
      name: "style", tag: "Style", mode: "structured", outputs: [captionTypes.style],
      implementation: { digest: captionFineStyleSurfaceImplementationDigest },
    },
    {
      name: "track", tag: "Track", mode: "structured", outputs: [compositionTypes.visualTrack],
      implementation: { digest: captionFineTrackSurfaceImplementationDigest },
    },
  ] as const;


export const captionFineManifest: ModuleManifest = {
  format: "svml.module@1",
  name: captionFineModuleRef.name,
  version: captionFineModuleRef.version,
  dependencies: [
    { module: captionModuleRef, digest: digestOf(captionManifest) },
    compositionDependency,
    mediaDependency,
    narrativeDependency,
    programSpaceDependency,
    semanticMapDependency,
  ],
  types: [],
  capabilities: [],
  producers: [{
    name: captionFineProducers.render.name,
    inputs: [
      { name: "caption", type: captionTypes.timedProjection },
      { name: "program", type: captionTypes.program },
      { name: "display", type: narrativeTypes.captionDisplay },
      { name: "space", type: programSpaceTypes.programSpace },
    ],
    outputs: [{ name: "track", type: compositionTypes.visualTrack }],
    needs: [],
    implementation: { digest: renderFineCaptionImplementationDigest },
  }],
};
