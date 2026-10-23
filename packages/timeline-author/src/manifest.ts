import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const timelineAuthorModuleRef = { name: "@hypit/timeline-author", version: "1" } as const;
export const timelineAuthorTypes = {
  header: { module: timelineAuthorModuleRef, name: "TimelineAuthorHeader" },
  point: { module: timelineAuthorModuleRef, name: "ConstructionPoint" },
  extent: { module: timelineAuthorModuleRef, name: "ConstructionExtent" },
  span: { module: timelineAuthorModuleRef, name: "ConstructionSpan" },
  duration: { module: timelineAuthorModuleRef, name: "ConstructionDurationSpec" },
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
    { name: timelineAuthorProducers.resolvedExtent.name, inputs: [{ name: "clock", type: timelineTypes.clock }, { name: "extent", type: temporalTypes.extent }], result: { kind: "output" as const, name: "extent", type: timelineAuthorTypes.extent } },
    { name: timelineAuthorProducers.offset.name, inputs: [{ name: "point", type: timelineAuthorTypes.point }, { name: "extent", type: timelineAuthorTypes.extent }, { name: "spec", type: timelineAuthorTypes.offset }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.earliest.name, inputs: [{ name: "left", type: timelineAuthorTypes.point }, { name: "right", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.latest.name, inputs: [{ name: "left", type: timelineAuthorTypes.point }, { name: "right", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.aliasPoint.name, inputs: [{ name: "point", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.span.name, inputs: [{ name: "start", type: timelineAuthorTypes.point }, { name: "extent", type: timelineAuthorTypes.extent }], result: { kind: "output" as const, name: "span", type: timelineAuthorTypes.span } },
    { name: timelineAuthorProducers.spanEnding.name, inputs: [{ name: "end", type: timelineAuthorTypes.point }, { name: "extent", type: timelineAuthorTypes.extent }], result: { kind: "output" as const, name: "span", type: timelineAuthorTypes.span } },
    { name: timelineAuthorProducers.spanBetween.name, inputs: [{ name: "start", type: timelineAuthorTypes.point }, { name: "end", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "span", type: timelineAuthorTypes.span } },
    { name: timelineAuthorProducers.spanStart.name, inputs: [{ name: "span", type: timelineAuthorTypes.span }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.spanEnd.name, inputs: [{ name: "span", type: timelineAuthorTypes.span }], result: { kind: "output" as const, name: "point", type: timelineAuthorTypes.point } },
    { name: timelineAuthorProducers.finalize.name, inputs: [{ name: "header", type: timelineAuthorTypes.header }, { name: "clock", type: timelineTypes.clock }, { name: "end", type: timelineAuthorTypes.point }], result: { kind: "output" as const, name: "timeline", type: timelineTypes.timeline } },
    { name: timelineAuthorProducers.instant.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "point", type: timelineAuthorTypes.point }, { name: "spec", type: timelineAuthorTypes.identity }], result: { kind: "output" as const, name: "instant", type: temporalTypes.instant } },
    { name: timelineAuthorProducers.window.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "span", type: timelineAuthorTypes.span }, { name: "spec", type: timelineAuthorTypes.identity }], result: { kind: "output" as const, name: "window", type: temporalTypes.window } },
  ],
};

export const timelineAuthorMarkupSurfaces = [{
  name: "timeline", tag: "Timeline", mode: "structured",
  outputs: [...Object.values(timelineAuthorTypes), timelineTypes.timeline, temporalTypes.instant, temporalTypes.window],
  vocabulary: {
    summary: "Lowers a small acyclic Instant/Window author graph into one finite Timeline and scoped absolute anchors.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the finalized Timeline." },
      { name: "clock", kind: "reference", required: true, accepts: [timelineTypes.clock], summary: "Selects its exact frame clock." },
      { name: "end", kind: "literal", required: true, summary: "Names the one Point expression that becomes frameCount." },
    ],
    children: [
      { tag: "Instant", cardinality: "many", summary: "Names one absolute boundary relationship.", attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Scoped Instant name." },
        { name: "at", kind: "literal", required: true, summary: "Restricted Point expression." },
      ] },
      { tag: "Window", cardinality: "many", summary: "Names one non-empty absolute interval from exactly two of from, until and for.", attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Scoped Window name." },
        { name: "from", kind: "literal", required: false, summary: "Start Point expression." },
        { name: "until", kind: "literal", required: false, summary: "End Point expression." },
        { name: "for", kind: "expression", required: false, accepts: [temporalTypes.extent], summary: "Exact duration literal or typed TemporalExtent reference." },
      ] },
    ],
    ports: [
      { name: "timeline", type: timelineTypes.timeline, summary: "The finalized absolute Timeline." },
      { name: "window", type: temporalTypes.window, summary: "The complete [start,end) Window." },
      { name: "start/end", type: temporalTypes.instant, summary: "The complete Timeline boundaries." },
      { name: "<name>", type: temporalTypes.instant, summary: "A named Instant child." },
      { name: "<name>", type: temporalTypes.window, summary: "A named Window child, with .start and .end boundary ports." },
    ],
    example: `<time:Timeline id="program" clock={clock} end="latest(speech.end,outro.end)">
  <time:Window id="speech" from="start" for={voice.extent}/>
  <time:Instant id="claim" at="speech.end-12f"/>
  <time:Window id="outro" from="claim" for="3s"/>
</time:Timeline>`,
  },
}, {
  name: "clock", tag: "Clock", mode: "structured", outputs: [timelineTypes.clock], vocabulary: {
    summary: "Declares the discrete frame conversion law.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Clock." },
      { name: "frame-rate", kind: "literal", required: true, summary: "Exact frames per second." },
    ],
    example: '<time:Clock id="clock" frame-rate="30"/>',
  },
}, {
  name: "window", tag: "Window", mode: "structured", outputs: [temporalTypes.duration, temporalTypes.extent,
    temporalTypes.shiftSpec, temporalTypes.instantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window],
  vocabulary: {
    summary: "Publishes one reusable absolute Window without putting content on Timeline.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Window and its .start/.end Instants." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the absolute coordinate system." },
      { name: "from", kind: "expression", required: false, accepts: [temporalTypes.instant], summary: "Inclusive absolute start." },
      { name: "until", kind: "expression", required: false, accepts: [temporalTypes.instant], summary: "Exclusive absolute end." },
      { name: "for", kind: "expression", required: false, accepts: [temporalTypes.extent], summary: "Exact duration." },
    ],
    ports: [
      { name: "<id>", type: temporalTypes.window, summary: "The resolved Window." },
      { name: "<id>.start/end", type: temporalTypes.instant, summary: "Its resolved boundary Instants." },
    ],
    example: '<time:Window id="reveal-band" timeline={film.timeline} from={reveal} until={answer-end}/>',
  },
}, {
  name: "instant", tag: "Instant", mode: "structured", outputs: [temporalTypes.duration, temporalTypes.extent,
    temporalTypes.shiftSpec, temporalTypes.instantSpec, temporalTypes.instant],
  vocabulary: {
    summary: "Publishes one reusable authored absolute Instant.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Instant." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the absolute coordinate system." },
      { name: "at", kind: "expression", required: true, accepts: [temporalTypes.instant], summary: "Absolute expression or existing Instant to shift." },
      { name: "offset", kind: "literal", required: false, summary: "Exact signed offset, valid when at references an existing Instant." },
    ],
    ports: [{ name: "<id>", type: temporalTypes.instant, summary: "The resolved Instant." }],
    example: '<time:Instant id="after-claim" timeline={film.timeline} at={claim} offset="+5f"/>',
  },
}] as const;
