import { captionDependency, captionTypes } from "@hypit/caption";
import { narrativeDependency } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { narrativeTemporalDependency, narrativeTemporalTypes } from "@hypit/narrative-temporal";

export const narrativeCaptionModuleRef = { name: "@hypit/narrative-caption", version: "1" } as const;
export const narrativeCaptionTypes = {
  binding: { module: narrativeCaptionModuleRef, name: "NarrativeCaptionBinding" },
} satisfies Record<string, TypeRef>;
export const narrativeCaptionProducers = {
  projectTiming: { module: narrativeCaptionModuleRef, name: "project-narrative-caption-timing" },
} satisfies Record<string, ProducerRef>;

export const narrativeCaptionManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: narrativeCaptionModuleRef.name,
  version: narrativeCaptionModuleRef.version,
  dependencies: [captionDependency, narrativeDependency, narrativeTemporalDependency],
  types: [narrativeCaptionTypes.binding.name],
  capabilities: [],
  producers: [{
    name: narrativeCaptionProducers.projectTiming.name,
    inputs: [
      { name: "document", type: captionTypes.document },
      { name: "binding", type: narrativeCaptionTypes.binding },
      { name: "projection", type: narrativeTemporalTypes.narrativeProjection },
    ],
    result: { kind: "output" as const, name: "timing", type: captionTypes.timing },
  }],
};
export const narrativeCaptionDependency = narrativeCaptionModuleRef;
