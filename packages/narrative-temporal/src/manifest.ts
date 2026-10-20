import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const narrativeTemporalModuleRef = { name: "@hypit/narrative-temporal", version: "1" } as const;
export const narrativeTemporalTypes = {
  narrativeAlignment: { module: narrativeTemporalModuleRef, name: "NarrativeAlignment" },
  narrativeProjection: { module: narrativeTemporalModuleRef, name: "NarrativeProjection" },
  narrativeInstantSpec: { module: narrativeTemporalModuleRef, name: "NarrativeInstantSpec" },
  narrativeProjectionParts: { module: narrativeTemporalModuleRef, name: "NarrativeProjectionParts" },
  narrativeProjectionHeader: { module: narrativeTemporalModuleRef, name: "NarrativeProjectionHeader" },
} satisfies Record<string, TypeRef>;
export const narrativeTemporalProducers = {
  materializeSegmentBoundaries: { module: narrativeTemporalModuleRef, name: "materialize-segment-boundaries" },
  projectAlignment: { module: narrativeTemporalModuleRef, name: "project-narrative-alignment" },
  combineProjectionParts: { module: narrativeTemporalModuleRef, name: "combine-narrative-projection-parts" },
  finalizeProjection: { module: narrativeTemporalModuleRef, name: "finalize-narrative-projection" },
  projectSelectionInstant: { module: narrativeTemporalModuleRef, name: "project-selection-instant" },
  projectSegmentInstant: { module: narrativeTemporalModuleRef, name: "project-segment-instant" },
  projectMomentInstant: { module: narrativeTemporalModuleRef, name: "project-moment-instant" },
} satisfies Record<string, ProducerRef>;

export const narrativeTemporalManifest: ModuleManifest = {
  format: "hypit.module@1", name: narrativeTemporalModuleRef.name, version: narrativeTemporalModuleRef.version,
  dependencies: [narrativeDependency, temporalDependency, timelineDependency],
  types: Object.values(narrativeTemporalTypes).map((type) => ({ name: type.name })), capabilities: [], producers: [{
    name: narrativeTemporalProducers.materializeSegmentBoundaries.name,
    inputs: [{ name: "narrative", type: narrativeTypes.narrative }, { name: "segment", type: narrativeTypes.segmentRef },
      { name: "domain", type: temporalTypes.localDomain }],
    result: { kind: "output" as const, name: "alignment", type: narrativeTemporalTypes.narrativeAlignment },
  }, {
    name: narrativeTemporalProducers.projectAlignment.name,
    inputs: [{ name: "alignment", type: narrativeTemporalTypes.narrativeAlignment },
      { name: "domain", type: temporalTypes.localDomain }, { name: "window", type: temporalTypes.window },
      { name: "timeline", type: timelineTypes.timeline }],
    result: { kind: "output" as const, name: "parts", type: narrativeTemporalTypes.narrativeProjectionParts },
  }, {
    name: narrativeTemporalProducers.combineProjectionParts.name,
    inputs: [{ name: "left", type: narrativeTemporalTypes.narrativeProjectionParts }, { name: "right", type: narrativeTemporalTypes.narrativeProjectionParts }],
    result: { kind: "output" as const, name: "parts", type: narrativeTemporalTypes.narrativeProjectionParts },
  }, {
    name: narrativeTemporalProducers.finalizeProjection.name,
    inputs: [{ name: "header", type: narrativeTemporalTypes.narrativeProjectionHeader },
      { name: "narrative", type: narrativeTypes.narrative }, { name: "timeline", type: timelineTypes.timeline },
      { name: "parts", type: narrativeTemporalTypes.narrativeProjectionParts }],
    result: { kind: "output" as const, name: "projection", type: narrativeTemporalTypes.narrativeProjection },
  }, {
    name: narrativeTemporalProducers.projectSelectionInstant.name,
    inputs: [{ name: "projection", type: narrativeTemporalTypes.narrativeProjection },
      { name: "selection", type: narrativeTypes.selection }, { name: "spec", type: narrativeTemporalTypes.narrativeInstantSpec }],
    result: { kind: "output" as const, name: "instant", type: temporalTypes.instant },
  }, {
    name: narrativeTemporalProducers.projectSegmentInstant.name,
    inputs: [{ name: "projection", type: narrativeTemporalTypes.narrativeProjection },
      { name: "segment", type: narrativeTypes.segmentRef }, { name: "spec", type: narrativeTemporalTypes.narrativeInstantSpec }],
    result: { kind: "output" as const, name: "instant", type: temporalTypes.instant },
  }, {
    name: narrativeTemporalProducers.projectMomentInstant.name,
    inputs: [{ name: "projection", type: narrativeTemporalTypes.narrativeProjection },
      { name: "moment", type: narrativeTypes.moment }, { name: "spec", type: narrativeTemporalTypes.narrativeInstantSpec }],
    result: { kind: "output" as const, name: "instant", type: temporalTypes.instant },
  }],
};
export const narrativeTemporalDependency = { module: narrativeTemporalModuleRef } as const;
