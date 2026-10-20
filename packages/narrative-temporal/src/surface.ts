import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation, GraphFragment } from "@hypit/hypit/author";
import {
  assertAttributes, assertEmptyElement, localName, textAttribute,
  type StructuredElement, type StructuredSurfaceHandler, type SurfaceResolvedReference,
} from "@hypit/hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { temporalProducers, temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { narrativeTemporalProducers, narrativeTemporalTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function rawReference(path: unknown, subject: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  if (typeof path !== "object" || path === null || !("kind" in path) || path.kind !== "reference" || !("path" in path)
    || typeof path.path !== "string") throw new Error(`${subject} must be a reference.`);
  const found = resolve(path.path);
  if (found === undefined) throw new Error(`${subject} is unresolved.`);
  return found;
}

function reference(path: unknown, subject: string, type: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  const found = rawReference(path, subject, resolve);
  if (!sameType(found.type, type)) throw new Error(`${subject} has the wrong Type.`);
  return found;
}

type NarrativeSource = {
  readonly kind: "selection" | "segment" | "moment";
  readonly reference: SurfaceResolvedReference;
};

function narrativeSource(element: StructuredElement, attribute: "at" | "during",
  resolve: (path: string) => SurfaceResolvedReference | undefined): NarrativeSource {
  const found = rawReference(element.attributes[attribute], `${element.name}.${attribute}`, resolve);
  if (sameType(found.type, narrativeTypes.selection)) return { kind: "selection", reference: found };
  if (sameType(found.type, narrativeTypes.segmentRef)) return { kind: "segment", reference: found };
  if (sameType(found.type, narrativeTypes.moment)) return { kind: "moment", reference: found };
  throw new Error(`${element.name}.${attribute} has the wrong Type.`);
}

type ProjectionMap = {
  readonly alignment: SurfaceResolvedReference;
  readonly domain: SurfaceResolvedReference;
  readonly window: SurfaceResolvedReference;
};

function projectionProducer(kind: NarrativeSource["kind"]) {
  return kind === "selection" ? narrativeTemporalProducers.projectSelectionInstant
    : kind === "segment" ? narrativeTemporalProducers.projectSegmentInstant
      : narrativeTemporalProducers.projectMomentInstant;
}

function sourceType(kind: NarrativeSource["kind"]): TypeRef {
  return kind === "selection" ? narrativeTypes.selection
    : kind === "segment" ? narrativeTypes.segmentRef : narrativeTypes.moment;
}

function outputFragment(kind: NarrativeSource["kind"], output: "instant" | "window"): GraphFragment {
  const ports: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "projection", type: narrativeTemporalTypes.narrativeProjection },
    { name: "source", type: sourceType(kind) },
    { name: "start-spec", type: narrativeTemporalTypes.narrativeInstantSpec },
  ];
  const operations: FragmentOperation[] = [{ id: "start", producer: projectionProducer(kind), inputs: {
    projection: input("projection"), [kind]: input("source"), spec: input("start-spec"),
  }, result: { kind: "output" as const, name: "instant" } }];
  if (output === "instant") return sealGraphFragment({ inputs: ports, operations,
    exports: [{ name: "instant", type: temporalTypes.instant, root: operation("start") }] });
  ports.push({ name: "end-spec", type: narrativeTemporalTypes.narrativeInstantSpec },
    { name: "window-spec", type: temporalTypes.windowSpec });
  operations.push({ id: "end", producer: projectionProducer(kind), inputs: {
    projection: input("projection"), [kind]: input("source"), spec: input("end-spec"),
  }, result: { kind: "output" as const, name: "instant" } }, {
    id: "window", producer: temporalProducers.composeWindow,
    inputs: { spec: input("window-spec"), start: operation("start"), end: operation("end") },
    result: { kind: "output" as const, name: "window" },
  });
  return sealGraphFragment({ inputs: ports, operations, exports: [
    { name: "window", type: temporalTypes.window, root: operation("window") },
    { name: "start", type: temporalTypes.instant, root: operation("start") },
    { name: "end", type: temporalTypes.instant, root: operation("end") },
  ] });
}

/** Build one reusable Narrative interpretation context. Maps are its only owned children. */
export const decodeNarrativeProjectionSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "narrative", "timeline"]);
  const id = textAttribute(element, "id");
  const narrative = reference(element.attributes.narrative, `${element.name}.narrative`, narrativeTypes.narrative, resolveReference);
  const timeline = reference(element.attributes.timeline, `${element.name}.timeline`, timelineTypes.timeline, resolveReference);
  const maps: ProjectionMap[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts Map children only.`);
      continue;
    }
    if (localName(child.name) !== "Map") throw new Error(`${element.name} accepts Map children only.`);
    assertAttributes(child, ["alignment", "domain", "window"]); assertEmptyElement(child);
    maps.push({
      alignment: reference(child.attributes.alignment, `${child.name}.alignment`, narrativeTemporalTypes.narrativeAlignment, resolveReference),
      domain: reference(child.attributes.domain, `${child.name}.domain`, temporalTypes.localDomain, resolveReference),
      window: reference(child.attributes.window, `${child.name}.window`, temporalTypes.window, resolveReference),
    });
  }
  if (maps.length === 0) throw new Error(`${element.name} requires at least one Map.`);

  const ports: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "header", type: narrativeTemporalTypes.narrativeProjectionHeader },
    { name: "narrative", type: narrativeTypes.narrative }, { name: "timeline", type: timelineTypes.timeline },
  ];
  const bindings: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
    header: { kind: "record", id: `${id}.__header` }, narrative: narrative.ref, timeline: timeline.ref,
  };
  const operations: FragmentOperation[] = [], entryRoots: string[] = [];
  for (const [index, map] of maps.entries()) {
    const alignmentName = `alignment-${index + 1}`;
    const domainName = `domain-${index + 1}`;
    const windowName = `window-${index + 1}`;
    ports.push({ name: alignmentName, type: narrativeTemporalTypes.narrativeAlignment },
      { name: domainName, type: temporalTypes.localDomain },
      { name: windowName, type: temporalTypes.window });
    bindings[alignmentName] = map.alignment.ref;
    bindings[domainName] = map.domain.ref;
    bindings[windowName] = map.window.ref;
    const operationId = `entry-${index + 1}`;
    operations.push({ id: operationId, producer: narrativeTemporalProducers.projectAlignment,
      inputs: { alignment: input(alignmentName), domain: input(domainName), window: input(windowName), timeline: input("timeline") },
      result: { kind: "output" as const, name: "parts" } });
    entryRoots.push(operationId);
  }
  let level = entryRoots, combineIndex = 0;
  while (level.length > 1) {
    const next: string[] = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) {
      const left = level[cursor]!, right = level[cursor + 1];
      if (right === undefined) { next.push(left); continue; }
      const operationId = `combine-${++combineIndex}`;
      operations.push({ id: operationId, producer: narrativeTemporalProducers.combineProjectionParts,
        inputs: { left: operation(left), right: operation(right) }, result: { kind: "output" as const, name: "parts" } });
      next.push(operationId);
    }
    level = next;
  }
  operations.push({ id: "finalize", producer: narrativeTemporalProducers.finalizeProjection,
    inputs: { header: input("header"), narrative: input("narrative"), timeline: input("timeline"), parts: operation(level[0]!) },
    result: { kind: "output" as const, name: "projection" } });
  const fragment = sealGraphFragment({ inputs: ports, operations,
    exports: [{ name: "projection", type: narrativeTemporalTypes.narrativeProjection, root: operation("finalize") }] });
  return {
    records: [{ id: `${id}.__header`, type: narrativeTemporalTypes.narrativeProjectionHeader,
      value: (canonicalize({ id })), range: element.range }],
    components: [{ id, fragment, inputs: bindings, outputs: { projection: id }, range: element.range }],
    exports: [id],
  };
};

/** Reveal one semantic point or interval boundary as a named absolute Instant. */
export const decodeNarrativeInstantSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "projection", "at", "boundary"], ["id", "projection", "at"]); assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const projection = reference(element.attributes.projection, `${element.name}.projection`,
    narrativeTemporalTypes.narrativeProjection, resolveReference);
  const source = narrativeSource(element, "at", resolveReference);
  const rawBoundary = element.attributes.boundary;
  let boundary: "start" | "end" | "cue";
  if (source.kind === "moment") {
    if (rawBoundary !== undefined) throw new Error(`${element.name}.boundary is invalid for a Moment.`);
    boundary = "cue";
  } else {
    if (rawBoundary !== "start" && rawBoundary !== "end") {
      throw new Error(`${element.name}.boundary must be start or end.`);
    }
    boundary = rawBoundary;
  }
  const specId = `${id}.__spec`, fragment = outputFragment(source.kind, "instant");
  return {
    records: [{ id: specId, type: narrativeTemporalTypes.narrativeInstantSpec,
      value: (canonicalize({ id, subjectId: id, boundary })), range: element.range }],
    components: [{ id: `${id}.__projection`, fragment, inputs: {
      projection: projection.ref, source: source.reference.ref, "start-spec": { kind: "record", id: specId },
    }, outputs: { instant: id }, range: element.range }],
    exports: [id],
  };
};

/** Reveal one authored semantic interval as a named absolute Window. */
export const decodeNarrativeWindowSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "projection", "during"], ["id", "projection", "during"]); assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const projection = reference(element.attributes.projection, `${element.name}.projection`,
    narrativeTemporalTypes.narrativeProjection, resolveReference);
  const source = narrativeSource(element, "during", resolveReference);
  if (source.kind === "moment") throw new Error(`${element.name}.during must be a Selection or Segment.`);
  const startSpecId = `${id}.__start`, endSpecId = `${id}.__end`, windowSpecId = `${id}.__window`;
  const fragment = outputFragment(source.kind, "window");
  return {
    records: [
      { id: startSpecId, type: narrativeTemporalTypes.narrativeInstantSpec,
        value: (canonicalize({ id: `${id}.start`, subjectId: id, boundary: "start" })), range: element.range },
      { id: endSpecId, type: narrativeTemporalTypes.narrativeInstantSpec,
        value: (canonicalize({ id: `${id}.end`, subjectId: id, boundary: "end" })), range: element.range },
      { id: windowSpecId, type: temporalTypes.windowSpec,
        value: (canonicalize({ id, subjectId: id })), range: element.range },
    ],
    components: [{ id: `${id}.__projection`, fragment, inputs: {
      projection: projection.ref, source: source.reference.ref,
      "start-spec": { kind: "record", id: startSpecId }, "end-spec": { kind: "record", id: endSpecId },
      "window-spec": { kind: "record", id: windowSpecId },
    }, outputs: { window: id, start: `${id}.start`, end: `${id}.end` }, range: element.range }],
    exports: [id, `${id}.start`, `${id}.end`],
  };
};

export const narrativeProjectionMarkupSurfaces = [{
  name: "narrative-projection", tag: "Projection", mode: "structured",
  outputs: [narrativeTemporalTypes.narrativeProjectionHeader, narrativeTemporalTypes.narrativeProjection],
  vocabulary: {
    summary: "Builds one explicit Narrative interpretation context from exact local-domain Maps.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names this projection." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative], summary: "Selects the Narrative identity." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the target Timeline." },
    ],
    children: [{ tag: "Map", cardinality: "many", summary: "Projects one local NarrativeAlignment through an exact domain-to-Window relation.", attributes: [
      { name: "alignment", kind: "reference", required: true, accepts: [narrativeTemporalTypes.narrativeAlignment], summary: "Local Narrative timing facts." },
      { name: "domain", kind: "reference", required: true, accepts: [temporalTypes.localDomain], summary: "The Alignment's complete local coordinate domain." },
      { name: "window", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Equal-length absolute Window receiving that domain." },
    ] }],
    ports: [{ name: "<id>", type: narrativeTemporalTypes.narrativeProjection, summary: "The completed Narrative interpretation context." }],
    example: `<semantic:Projection id="story-time" narrative={story} timeline={film.timeline}>
  <semantic:Map alignment={opening.alignment} domain={opening.domain} window={program.opening}/>
</semantic:Projection>`,
  },
}, {
  name: "narrative-instant", tag: "Instant", mode: "structured",
  outputs: [narrativeTemporalTypes.narrativeInstantSpec, temporalTypes.instant],
  vocabulary: {
    summary: "Reveals one Narrative point or boundary as a named absolute Instant.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the absolute Instant." },
      { name: "projection", kind: "reference", required: true, accepts: [narrativeTemporalTypes.narrativeProjection], summary: "Selects the interpretation context." },
      { name: "at", kind: "expression", required: true, accepts: [narrativeTypes.moment, narrativeTypes.selection, narrativeTypes.segmentRef], summary: "Chooses the semantic point or interval." },
      { name: "boundary", kind: "literal", required: false, values: ["start", "end"], summary: "Required boundary for a Selection or Segment." },
    ],
    ports: [{ name: "<id>", type: temporalTypes.instant, summary: "The revealed absolute Instant." }],
    example: '<semantic:Instant id="claim" projection={story-time} at={story.moment.claim}/>',
  },
}, {
  name: "narrative-window", tag: "Window", mode: "structured",
  outputs: [narrativeTemporalTypes.narrativeInstantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window],
  vocabulary: {
    summary: "Reveals one Narrative interval as a named absolute Window.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Window and its boundaries." },
      { name: "projection", kind: "reference", required: true, accepts: [narrativeTemporalTypes.narrativeProjection], summary: "Selects the interpretation context." },
      { name: "during", kind: "expression", required: true, accepts: [narrativeTypes.selection, narrativeTypes.segmentRef], summary: "Chooses the semantic interval." },
    ],
    ports: [
      { name: "<id>", type: temporalTypes.window, summary: "The revealed absolute Window." },
      { name: "<id>.start/end", type: temporalTypes.instant, summary: "Its absolute boundary Instants." },
    ],
    example: '<semantic:Window id="proof" projection={story-time} during={story.selection.proof}/>',
  },
}] as const;
