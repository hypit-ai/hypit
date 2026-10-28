import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const timelineAuthorModuleRef = { name: "@hypit/timeline-author", version: "1" } as const;
export const timelineAuthorTypes = {
  header: { module: timelineAuthorModuleRef, name: "TimelineAuthorHeader" },
  point: { module: timelineAuthorModuleRef, name: "ConstructionPoint" },
  extent: { module: timelineAuthorModuleRef, name: "ConstructionExtent" },
  duration: { module: timelineAuthorModuleRef, name: "ConstructionDurationSpec" },
  resolution: { module: timelineAuthorModuleRef, name: "ConstructionResolutionSpec" },
  offset: { module: timelineAuthorModuleRef, name: "ConstructionOffsetSpec" },
  identity: { module: timelineAuthorModuleRef, name: "ConstructionIdentitySpec" },
} satisfies Record<string, TypeRef>;

export const timelineAuthorProducers = {
  origin: { module: timelineAuthorModuleRef, name: "origin" },
  duration: { module: timelineAuthorModuleRef, name: "duration-extent" },
  resolvedExtent: { module: timelineAuthorModuleRef, name: "resolved-extent" },
  offset: { module: timelineAuthorModuleRef, name: "offset-point" },
  earliest: { module: timelineAuthorModuleRef, name: "earliest-point" },
  latest: { module: timelineAuthorModuleRef, name: "latest-point" },
  aliasPoint: { module: timelineAuthorModuleRef, name: "alias-point" },
  span: { module: timelineAuthorModuleRef, name: "construct-span" },
  spanEnding: { module: timelineAuthorModuleRef, name: "construct-span-ending" },
  spanBetween: { module: timelineAuthorModuleRef, name: "construct-span-between" },
  spanStart: { module: timelineAuthorModuleRef, name: "span-start" },
  spanEnd: { module: timelineAuthorModuleRef, name: "span-end" },
  finalize: { module: timelineAuthorModuleRef, name: "finalize-timeline" },
  instant: { module: timelineAuthorModuleRef, name: "materialize-instant" },
  window: { module: timelineAuthorModuleRef, name: "materialize-window" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
export const timelineAuthorHeaderSchema: ValueSchema = { kind: "object", fields: { id: { schema: string } } };

export const timelineAuthorManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: timelineAuthorModuleRef.name,
  version: timelineAuthorModuleRef.version,
  dependencies: [timelineDependency, temporalDependency],
  types: Object.values(timelineAuthorTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    { name: timelineAuthorProducers.origin.name, inputs: [{ name: "clock", type: timelineTypes.clock }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.duration.name, inputs: [{ name: "clock", type: timelineTypes.clock }, { name: "duration", type: timelineAuthorTypes.duration }], result: { kind: "output" as const, name: "extent", type: timelineAuthorTypes.extent } },
    { name: timelineAuthorProducers.resolvedExtent.name, inputs: [{ name: "clock", type: timelineTypes.clock },
      { name: "extent", type: temporalTypes.extent }, { name: "resolution", type: timelineAuthorTypes.resolution }],
      result: { kind: "output" as const, name: "extent", type: timelineAuthorTypes.extent } },
    { name: timelineAuthorProducers.offset.name, inputs: [{ name: "point", type: timelineAuthorTypes.point }, { name: "extent", type: timelineAuthorTypes.extent }, { name: "spec", type: timelineAuthorTypes.offset }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.earliest.name, inputs: [{ name: "left", type: timelineAuthorTypes.point }, { name: "right", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.latest.name, inputs: [{ name: "left", type: timelineAuthorTypes.point }, { name: "right", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.aliasPoint.name, inputs: [{ name: "point", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.span.name, inputs: [{ name: "start", type: timelineAuthorTypes.point }, { name: "extent", type: timelineAuthorTypes.extent }], result: { kind: "output" as const, name: "span", type: timelineTypes.frameSpan } },
    { name: timelineAuthorProducers.spanEnding.name, inputs: [{ name: "end", type: timelineAuthorTypes.point }, { name: "extent", type: timelineAuthorTypes.extent }], result: { kind: "output" as const, name: "span", type: timelineTypes.frameSpan } },
    { name: timelineAuthorProducers.spanBetween.name, inputs: [{ name: "start", type: timelineAuthorTypes.point }, { name: "end", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "span", type: timelineTypes.frameSpan } },
    { name: timelineAuthorProducers.spanStart.name, inputs: [{ name: "span", type: timelineTypes.frameSpan }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.spanEnd.name, inputs: [{ name: "span", type: timelineTypes.frameSpan }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.finalize.name, inputs: [{ name: "header", type: timelineAuthorTypes.header }, { name: "clock", type: timelineTypes.clock }, { name: "end", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "timeline", type: timelineTypes.timeline } },
    { name: timelineAuthorProducers.instant.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "point", type: timelineAuthorTypes.point }, { name: "spec", type: timelineAuthorTypes.identity }], result: { kind: "output" as const, name: "instant", type: temporalTypes.instant } },
    { name: timelineAuthorProducers.window.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "span", type: timelineTypes.frameSpan }, { name: "spec", type: timelineAuthorTypes.identity }], result: { kind: "output" as const, name: "window", type: temporalTypes.window } },
  ],
};
