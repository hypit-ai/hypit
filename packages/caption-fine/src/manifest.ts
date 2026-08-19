import { captionManifest, captionModuleRef, captionTypes } from "@hypit/caption";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency } from "@hypit/media";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { semanticMapDependency } from "@hypit/semantic-map";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";

export const captionFineModuleRef = { name: "@hypit/caption-fine", version: "1" } as const;
export const captionFineProducers = {
  render: { module: captionFineModuleRef, name: "render-fine-caption" },
} satisfies Record<string, ProducerRef>;

export const captionFineMarkupSurfaces = [
    {
      name: "style", tag: "Style", mode: "structured", outputs: [captionTypes.style],
    },
    {
      name: "track", tag: "Track", mode: "structured", outputs: [compositionTypes.visualTrack],
    },
  ] as const;


export const captionFineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: captionFineModuleRef.name,
  version: captionFineModuleRef.version,
  dependencies: [
    { module: captionModuleRef },
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
  }],
};
