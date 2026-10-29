import { temporalDependency } from "@hypit/temporal";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

import { captionModuleRef, captionTypes } from "@hypit/caption";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency } from "@hypit/media";

import type { ModuleManifest, ProducerRef } from "@hypit/hypit/protocol";
import { spatialSequenceDependency, spatialSequenceTypes } from "@hypit/spatial-sequence";
import { spatialDependency, spatialTypes } from "@hypit/spatial";

export const captionFineModuleRef = { name: "@hypit/caption-fine", version: "1" } as const;
export const captionFineTypes = {
  schedule: { module: captionFineModuleRef, name: "FineCaptionSchedule" },
  regionBindings: { module: captionFineModuleRef, name: "FineCaptionRegionBindings" },
} as const;
export const captionFineProducers = {
  schedule: { module: captionFineModuleRef, name: "schedule-fine-caption" },
  render: { module: captionFineModuleRef, name: "render-fine-caption" },
  renderWithRegions: { module: captionFineModuleRef, name: "render-fine-caption-with-regions" },
} satisfies Record<string, ProducerRef>;


export const captionFineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: captionFineModuleRef.name,
  version: captionFineModuleRef.version,
  dependencies: [
    captionModuleRef,
    compositionDependency,
    mediaDependency,
    spatialDependency,
    timelineDependency,
    spatialSequenceDependency, temporalDependency,
  ],
  types: [captionFineTypes.schedule.name, captionFineTypes.regionBindings.name],
  capabilities: [],
  producers: [
    {
      name: captionFineProducers.schedule.name,
      inputs: [
        { name: "timing", type: captionTypes.timing },
        { name: "program", type: captionTypes.program },
        { name: "document", type: captionTypes.document },
      ],
      result: { kind: "output" as const, name: "schedule", type: captionFineTypes.schedule },
    },
    {
      name: captionFineProducers.render.name,
      inputs: [
        { name: "schedule", type: captionFineTypes.schedule },
        { name: "program", type: captionTypes.program },
        { name: "document", type: captionTypes.document },
        { name: "timeline", type: timelineTypes.timeline },
        { name: "within", type: spatialTypes.frame },
      ],
      result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack },
    },
    {
      name: captionFineProducers.renderWithRegions.name,
      inputs: [
        { name: "schedule", type: captionFineTypes.schedule },
        { name: "program", type: captionTypes.program },
        { name: "document", type: captionTypes.document },
        { name: "timeline", type: timelineTypes.timeline },
        { name: "within", type: spatialTypes.frame },
        { name: "regions", type: spatialSequenceTypes.timelineRegions },
        { name: "regionBindings", type: captionFineTypes.regionBindings },
      ],
      result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack },
    },
  ],
};
