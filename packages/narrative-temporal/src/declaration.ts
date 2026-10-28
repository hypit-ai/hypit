import {
  declarationField,
  sealGraphFragment,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type FragmentOperation,
  type GraphFragment,
} from "@hypit/hypit/author";
import { narrativeTypes } from "@hypit/narrative";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { temporalProducers, temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { narrativeTemporalModuleRef, narrativeTemporalProducers, narrativeTemporalTypes } from "./manifest.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string): string {
  const value = field(node, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) throw new Error(`${node.name}.${name} must be non-empty text.`);
  return value.value.trim();
}

async function rawReference(
  node: DeclarationNode,
  name: string,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined) throw new Error(`${node.name}.${name} is unresolved.`);
  return reference;
}

async function resolved(
  node: DeclarationNode,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const reference = await rawReference(node, name, resolveReference);
  if (!sameType(reference.type, type)) throw new Error(`${node.name}.${name} has the wrong Type.`);
  return reference;
}

type NarrativeSource = {
  readonly kind: "selection" | "segment" | "moment";
  readonly reference: AuthorResolvedReference;
};

async function narrativeSource(
  node: DeclarationNode,
  name: "at" | "during",
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<NarrativeSource> {
  const reference = await rawReference(node, name, resolveReference);
  if (sameType(reference.type, narrativeTypes.selection)) return { kind: "selection", reference };
  if (sameType(reference.type, narrativeTypes.segmentRef)) return { kind: "segment", reference };
  if (sameType(reference.type, narrativeTypes.moment)) return { kind: "moment", reference };
  throw new Error(`${node.name}.${name} has the wrong Type.`);
}

function projectionProducer(kind: NarrativeSource["kind"]) {
  return kind === "selection" ? narrativeTemporalProducers.projectSelectionInstant
    : kind === "segment" ? narrativeTemporalProducers.projectSegmentInstant
      : narrativeTemporalProducers.projectMomentInstant;
}

function sourceType(kind: NarrativeSource["kind"]): TypeRef {
  return kind === "selection" ? narrativeTypes.selection
    : kind === "segment" ? narrativeTypes.segmentRef : narrativeTypes.moment;
}

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createNarrativeProjectionFragment(mapCount: number): GraphFragment {
  const ports: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "header", type: narrativeTemporalTypes.narrativeProjectionHeader },
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "timeline", type: timelineTypes.timeline },
  ];
  const operations: FragmentOperation[] = [];
  const entryRoots: string[] = [];
  for (let index = 0; index < mapCount; index += 1) {
    const number = index + 1;
    const alignmentName = `alignment-${number}`, domainName = `domain-${number}`, windowName = `window-${number}`;
    ports.push(
      { name: alignmentName, type: narrativeTemporalTypes.narrativeAlignment },
      { name: domainName, type: temporalTypes.localDomain },
      { name: windowName, type: temporalTypes.window },
    );
    const id = `entry-${number}`;
    operations.push({ id, producer: narrativeTemporalProducers.projectAlignment,
      inputs: { alignment: input(alignmentName), domain: input(domainName), window: input(windowName), timeline: input("timeline") },
      result: { kind: "output", name: "parts" } });
    entryRoots.push(id);
  }
  let level = entryRoots, combineIndex = 0;
  while (level.length > 1) {
    const next: string[] = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) {
      const left = level[cursor]!, right = level[cursor + 1];
      if (right === undefined) { next.push(left); continue; }
      const id = `combine-${++combineIndex}`;
      operations.push({ id, producer: narrativeTemporalProducers.combineProjectionParts,
        inputs: { left: operation(left), right: operation(right) }, result: { kind: "output", name: "parts" } });
      next.push(id);
    }
    level = next;
  }
  operations.push({ id: "finalize", producer: narrativeTemporalProducers.finalizeProjection,
    inputs: { header: input("header"), narrative: input("narrative"), timeline: input("timeline"), parts: operation(level[0]!) },
    result: { kind: "output", name: "projection" } });
  return sealGraphFragment({ inputs: ports, operations,
    exports: [{ name: "projection", type: narrativeTemporalTypes.narrativeProjection, root: operation("finalize") }] });
}

export function createNarrativeTimeFragment(kind: NarrativeSource["kind"], output: "instant" | "window"): GraphFragment {
  const ports: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "projection", type: narrativeTemporalTypes.narrativeProjection },
    { name: "source", type: sourceType(kind) },
    { name: "start-spec", type: narrativeTemporalTypes.narrativeInstantSpec },
  ];
  const operations: FragmentOperation[] = [{ id: "start", producer: projectionProducer(kind), inputs: {
    projection: input("projection"), [kind]: input("source"), spec: input("start-spec"),
  }, result: { kind: "output", name: "instant" } }];
  if (output === "instant") return sealGraphFragment({ inputs: ports, operations,
    exports: [{ name: "instant", type: temporalTypes.instant, root: operation("start") }] });
  ports.push(
    { name: "end-spec", type: narrativeTemporalTypes.narrativeInstantSpec },
    { name: "window-spec", type: temporalTypes.windowSpec },
  );
  operations.push(
    { id: "end", producer: projectionProducer(kind), inputs: {
      projection: input("projection"), [kind]: input("source"), spec: input("end-spec"),
    }, result: { kind: "output", name: "instant" } },
    { id: "window", producer: temporalProducers.composeWindow,
      inputs: { spec: input("window-spec"), start: operation("start"), end: operation("end") },
      result: { kind: "output", name: "window" } },
  );
  return sealGraphFragment({ inputs: ports, operations, exports: [
    { name: "window", type: temporalTypes.window, root: operation("window") },
    { name: "start", type: temporalTypes.instant, root: operation("start") },
    { name: "end", type: temporalTypes.instant, root: operation("end") },
  ] });
}

function outputBinding(name: string, component: string, output: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component, output }, type };
}

export const narrativeProjectionAuthorDeclaration: AuthorDeclarationCompiler = {
  module: narrativeTemporalModuleRef,
  declaration: "narrative-projection",
  outputs: [narrativeTemporalTypes.narrativeProjectionHeader, narrativeTemporalTypes.narrativeProjectionParts, narrativeTemporalTypes.narrativeProjection],
  shape: {
    summary: "Builds one explicit Narrative interpretation context from exact local-domain Maps.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names this projection." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative], summary: "Selects the Narrative identity." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the target Timeline." },
    ],
    children: [{ name: "Map", cardinality: "many", summary: "Projects one local NarrativeAlignment into one absolute Window.", fields: [
      { name: "alignment", kind: "reference", required: true, accepts: [narrativeTemporalTypes.narrativeAlignment], summary: "Selects local Narrative timing facts." },
      { name: "domain", kind: "reference", required: true, accepts: [temporalTypes.localDomain], summary: "Selects the Alignment's local coordinate domain." },
      { name: "window", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Selects the receiving absolute Window." },
    ] }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [outputBinding(id, id, "projection", narrativeTemporalTypes.narrativeProjection)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    if (declaration.children.length === 0) throw new Error(`${declaration.name} requires at least one Map.`);
    const narrative = await resolved(declaration, "narrative", narrativeTypes.narrative, resolveReference);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      header: { kind: "record", id: `${id}.__header` }, narrative: narrative.ref, timeline: timeline.ref,
    };
    for (const [index, child] of declaration.children.entries()) {
      const number = index + 1;
      inputs[`alignment-${number}`] = (await resolved(child, "alignment", narrativeTemporalTypes.narrativeAlignment, resolveReference)).ref;
      inputs[`domain-${number}`] = (await resolved(child, "domain", temporalTypes.localDomain, resolveReference)).ref;
      inputs[`window-${number}`] = (await resolved(child, "window", temporalTypes.window, resolveReference)).ref;
    }
    return {
      records: [{ id: `${id}.__header`, type: narrativeTemporalTypes.narrativeProjectionHeader, value: canonicalize({ id }), range: declaration.range }],
      components: [{ id, fragment: createNarrativeProjectionFragment(declaration.children.length), inputs, outputs: { projection: id }, range: declaration.range }],
    };
  },
};

export const narrativeInstantAuthorDeclaration: AuthorDeclarationCompiler = {
  module: narrativeTemporalModuleRef,
  declaration: "narrative-instant",
  outputs: [narrativeTemporalTypes.narrativeInstantSpec, temporalTypes.instant],
  shape: {
    summary: "Reveals one Narrative point or boundary as a named absolute Instant.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the absolute Instant." },
      { name: "projection", kind: "reference", required: true, accepts: [narrativeTemporalTypes.narrativeProjection], summary: "Selects the interpretation context." },
      { name: "at", kind: "expression", required: true, accepts: [narrativeTypes.moment, narrativeTypes.selection, narrativeTypes.segmentRef], summary: "Selects the semantic point or interval." },
      { name: "boundary", kind: "literal", required: false, values: ["start", "end"], summary: "Selects an interval boundary." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [outputBinding(id, `${id}.__projection`, "instant", temporalTypes.instant)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const projection = await resolved(declaration, "projection", narrativeTemporalTypes.narrativeProjection, resolveReference);
    const source = await narrativeSource(declaration, "at", resolveReference);
    let boundary: "start" | "end" | "cue";
    if (source.kind === "moment") {
      if (field(declaration, "boundary") !== undefined) throw new Error(`${declaration.name}.boundary is invalid for a Moment.`);
      boundary = "cue";
    } else {
      const value = field(declaration, "boundary") === undefined ? undefined : literal(declaration, "boundary");
      if (value !== "start" && value !== "end") throw new Error(`${declaration.name}.boundary must be start or end.`);
      boundary = value;
    }
    const specId = `${id}.__spec`, componentId = `${id}.__projection`;
    return {
      records: [{ id: specId, type: narrativeTemporalTypes.narrativeInstantSpec,
        value: canonicalize({ id, subjectId: id, boundary }), range: declaration.range }],
      components: [{ id: componentId, fragment: createNarrativeTimeFragment(source.kind, "instant"),
        inputs: { projection: projection.ref, source: source.reference.ref, "start-spec": { kind: "record", id: specId } },
        outputs: { instant: id }, range: declaration.range }],
    };
  },
};

export const narrativeWindowAuthorDeclaration: AuthorDeclarationCompiler = {
  module: narrativeTemporalModuleRef,
  declaration: "narrative-window",
  outputs: [narrativeTemporalTypes.narrativeInstantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window],
  shape: {
    summary: "Reveals one Narrative interval as a named absolute Window.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Window and its boundaries." },
      { name: "projection", kind: "reference", required: true, accepts: [narrativeTemporalTypes.narrativeProjection], summary: "Selects the interpretation context." },
      { name: "during", kind: "expression", required: true, accepts: [narrativeTypes.selection, narrativeTypes.segmentRef], summary: "Selects the semantic interval." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id"), component = `${id}.__projection`;
    return [
      outputBinding(id, component, "window", temporalTypes.window),
      outputBinding(`${id}.start`, component, "start", temporalTypes.instant),
      outputBinding(`${id}.end`, component, "end", temporalTypes.instant),
    ];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const projection = await resolved(declaration, "projection", narrativeTemporalTypes.narrativeProjection, resolveReference);
    const source = await narrativeSource(declaration, "during", resolveReference);
    if (source.kind === "moment") throw new Error(`${declaration.name}.during must be a Selection or Segment.`);
    const startSpecId = `${id}.__start`, endSpecId = `${id}.__end`, windowSpecId = `${id}.__window`, componentId = `${id}.__projection`;
    return {
      records: [
        { id: startSpecId, type: narrativeTemporalTypes.narrativeInstantSpec, value: canonicalize({ id: `${id}.start`, subjectId: id, boundary: "start" }), range: declaration.range },
        { id: endSpecId, type: narrativeTemporalTypes.narrativeInstantSpec, value: canonicalize({ id: `${id}.end`, subjectId: id, boundary: "end" }), range: declaration.range },
        { id: windowSpecId, type: temporalTypes.windowSpec, value: canonicalize({ id, subjectId: id }), range: declaration.range },
      ],
      components: [{ id: componentId, fragment: createNarrativeTimeFragment(source.kind, "window"), inputs: {
        projection: projection.ref, source: source.reference.ref,
        "start-spec": { kind: "record", id: startSpecId }, "end-spec": { kind: "record", id: endSpecId },
        "window-spec": { kind: "record", id: windowSpecId },
      }, outputs: { window: id, start: `${id}.start`, end: `${id}.end` }, range: declaration.range }],
    };
  },
};

export const narrativeTemporalAuthorDeclarations = [
  narrativeProjectionAuthorDeclaration,
  narrativeInstantAuthorDeclaration,
  narrativeWindowAuthorDeclaration,
] as const;

export const narrativeTemporalMarkupDeclarations = [
  { name: "narrative-projection", tag: "Projection" },
  { name: "narrative-instant", tag: "Instant" },
  { name: "narrative-window", tag: "Window" },
] as const;
