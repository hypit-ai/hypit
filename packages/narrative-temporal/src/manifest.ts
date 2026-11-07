import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";

export const narrativeTemporalModuleRef = { name: "@hypit/narrative-temporal", version: "1" } as const;
export const narrativeTemporalTypes = {
  narrativeAlignment: { module: narrativeTemporalModuleRef, name: "NarrativeAlignment" },
  narrativeLocalTiming: { module: narrativeTemporalModuleRef, name: "NarrativeLocalTiming" },
  narrativeTimingParts: { module: narrativeTemporalModuleRef, name: "NarrativeTimingParts" },
  narrativeTimingHeader: { module: narrativeTemporalModuleRef, name: "NarrativeTimingHeader" },
} satisfies Record<string, TypeRef>;
export const narrativeTemporalProducers = {
  materializeSegmentBoundaries: { module: narrativeTemporalModuleRef, name: "materialize-segment-boundaries" },
  collectAlignment: { module: narrativeTemporalModuleRef, name: "collect-narrative-alignment" },
  combineTimingParts: { module: narrativeTemporalModuleRef, name: "combine-narrative-timing-parts" },
  finalizeTiming: { module: narrativeTemporalModuleRef, name: "finalize-narrative-local-timing" },
} satisfies Record<string, ProducerRef>;

export const narrativeTemporalManifest: ModuleManifest = {
  format: "hypit.module@1", name: narrativeTemporalModuleRef.name, version: narrativeTemporalModuleRef.version,
  dependencies: [narrativeDependency, temporalDependency],
  types: Object.values(narrativeTemporalTypes).map((type) => type.name), capabilities: [], producers: [{
    name: narrativeTemporalProducers.materializeSegmentBoundaries.name,
    inputs: [{ name: "narrative", type: narrativeTypes.narrative }, { name: "segment", type: narrativeTypes.segmentRef },
      { name: "domain", type: temporalTypes.localDomain }],
    result: { kind: "output" as const, name: "alignment", type: narrativeTemporalTypes.narrativeAlignment },
  }, {
    name: narrativeTemporalProducers.collectAlignment.name,
    inputs: [{ name: "alignment", type: narrativeTemporalTypes.narrativeAlignment },
      { name: "domain", type: temporalTypes.localDomain }],
    result: { kind: "output" as const, name: "parts", type: narrativeTemporalTypes.narrativeTimingParts },
  }, {
    name: narrativeTemporalProducers.combineTimingParts.name,
    inputs: [{ name: "left", type: narrativeTemporalTypes.narrativeTimingParts },
      { name: "right", type: narrativeTemporalTypes.narrativeTimingParts }],
    result: { kind: "output" as const, name: "parts", type: narrativeTemporalTypes.narrativeTimingParts },
  }, {
    name: narrativeTemporalProducers.finalizeTiming.name,
    inputs: [{ name: "header", type: narrativeTemporalTypes.narrativeTimingHeader },
      { name: "narrative", type: narrativeTypes.narrative },
      { name: "domain", type: temporalTypes.localDomain },
      { name: "parts", type: narrativeTemporalTypes.narrativeTimingParts }],
    result: { kind: "output" as const, name: "timing", type: narrativeTemporalTypes.narrativeLocalTiming },
  }],
};
export const narrativeTemporalDependency = narrativeTemporalModuleRef;
