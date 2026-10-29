import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const spatialSequenceModuleRef = { name: "@hypit/spatial-sequence", version: "1" } as const;
export const spatialSequenceTypes = {
  document: { module: spatialSequenceModuleRef, name: "RegionSequenceDocument" },
  timelineRegions: { module: spatialSequenceModuleRef, name: "TimelineRegionSequence" },
} satisfies Record<string, TypeRef>;
export const spatialSequenceProducers = {
  resolveTimelineRegions: { module: spatialSequenceModuleRef, name: "resolve-timeline-regions" },
} satisfies Record<string, ProducerRef>;

export const spatialSequenceManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: spatialSequenceModuleRef.name,
  version: spatialSequenceModuleRef.version,
  dependencies: [spatialDependency, timelineDependency],
  types: [spatialSequenceTypes.document.name, spatialSequenceTypes.timelineRegions.name],
  capabilities: [],
  producers: [{
    name: spatialSequenceProducers.resolveTimelineRegions.name,
    inputs: [
      { name: "document", type: spatialSequenceTypes.document },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "canvas", type: spatialTypes.canvas },
    ],
    result: { kind: "output" as const, name: "regions", type: spatialSequenceTypes.timelineRegions },
  }],
};
export const spatialSequenceDependency = spatialSequenceModuleRef;
