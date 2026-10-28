import {
  declarationField,
  sealGraphFragment,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorDeclarationOutput,
  type AuthorResolvedReference,
  type FragmentOperation,
  type FragmentOperationRef,
} from "@hypit/hypit/author";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import {
  parseTemporalDuration,
  temporalProducers,
  temporalTypes,
  type TemporalDuration,
  type TemporalInstantExpression,
} from "@hypit/temporal";
import { timelineTypes, type Clock } from "@hypit/timeline";

import { compileTimelineAuthorFragment } from "./fragment.js";
import { parseTimelineInstantExpression } from "./literal.js";
import { timelineAuthorModuleRef, timelineAuthorTypes } from "./manifest.js";
import { constructionDuration } from "./program.js";
import type { ConstructionDurationSpec, TimelineAuthorDeclaration } from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string): FragmentOperationRef => ({ kind: "fragment-operation", operation: id });

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string): string {
  const value = field(node, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be text.`);
  }
  return value.value.trim();
}

function optionalLiteral(node: DeclarationNode, name: string): string | undefined {
  const value = field(node, name);
  if (value === undefined) return undefined;
  if (value.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be text.`);
  }
  return value.value.trim();
}

async function resolved(
  declaration: AuthorDeclaration,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(declaration, name);
  if (value?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) {
    throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  }
  return reference;
}

function recordBinding(name: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "record", id: name }, type };
}

function componentBinding(component: string, output: string, name: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component, output }, type };
}

function signedDuration(raw: string, label: string): { readonly direction: 1 | -1; readonly duration: TemporalDuration } {
  const match = /^([+-])(.+)$/u.exec(raw.trim());
  if (match === null) throw new Error(`${label} must be an exact signed duration such as +12f or -250ms.`);
  return { direction: match[1] === "+" ? 1 : -1, duration: parseTemporalDuration(match[2]!, label) };
}

function timelinePlan(declaration: AuthorDeclaration) {
  const id = literal(declaration, "id");
  const end = literal(declaration, "end");
  const declarations: TimelineAuthorDeclaration[] = [];
  for (const [index, child] of declaration.children.entries()) {
    const childId = literal(child, "id");
    if (child.name === "Instant") {
      declarations.push({ id: childId, kind: "instant", at: literal(child, "at") });
      continue;
    }
    if (child.name !== "Window") throw new Error(`${declaration.name} accepts only Instant and Window children.`);
    const length = field(child, "for");
    const from = optionalLiteral(child, "from");
    const until = optionalLiteral(child, "until");
    declarations.push({
      id: childId,
      kind: "window",
      ...(from === undefined ? {} : { from }),
      ...(until === undefined ? {} : { until }),
      ...(length?.kind === "literal" ? { duration: length.value.trim() } : {}),
      ...(length?.kind === "reference" ? { extentInput: `extent-${index + 1}` } : {}),
    });
  }
  return { id, declarations, plan: compileTimelineAuthorFragment({ id, end, declarations }) };
}

export const clockAuthorDeclaration: AuthorDeclarationCompiler = {
  module: timelineAuthorModuleRef,
  declaration: "clock",
  outputs: [timelineTypes.clock],
  shape: {
    summary: "Declares the exact frame conversion law.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Clock." },
      { name: "frame-rate", kind: "literal", required: true, summary: "Exact positive rational frames per second." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [recordBinding(id, timelineTypes.clock)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const match = /^(\d+)(?:\/(\d+))?$/u.exec(literal(declaration, "frame-rate"));
    if (match === null) throw new Error("Clock.frame-rate must be a positive rational.");
    const numerator = Number(match[1]);
    const denominator = Number(match[2] ?? 1);
    if (!Number.isSafeInteger(numerator) || numerator < 1 || !Number.isSafeInteger(denominator) || denominator < 1) {
      throw new Error("Clock.frame-rate must be a positive rational.");
    }
    return {
      records: [{ id, type: timelineTypes.clock, value: canonicalize({ frameRate: { numerator, denominator } }), range: declaration.range }],
      components: [],
    };
  },
};

export const timelineAuthorDeclaration: AuthorDeclarationCompiler = {
  module: timelineAuthorModuleRef,
  declaration: "timeline",
  outputs: [...Object.values(timelineAuthorTypes), timelineTypes.timeline, timelineTypes.frameSpan,
    temporalTypes.instant, temporalTypes.window],
  shape: {
    summary: "Constructs one finite Timeline and its named absolute Instants and Windows.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the finalized Timeline." },
      { name: "clock", kind: "reference", required: true, accepts: [timelineTypes.clock], summary: "Selects its exact frame clock." },
      { name: "end", kind: "literal", required: true, summary: "Chooses the exclusive end Point expression." },
    ],
    children: [{
      name: "Instant", cardinality: "many", summary: "Names one absolute Point expression.", fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the scoped Instant." },
        { name: "at", kind: "literal", required: true, summary: "Provides the Point expression." },
      ],
    }, {
      name: "Window", cardinality: "many", summary: "Names one interval from exactly two temporal terms.", fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the scoped Window." },
        { name: "from", kind: "literal", required: false, summary: "Provides its start Point expression." },
        { name: "until", kind: "literal", required: false, summary: "Provides its end Point expression." },
        { name: "for", kind: "expression", required: false, accepts: [temporalTypes.extent], summary: "Provides a duration or Extent." },
      ],
    }],
  },
  bindings(declaration) {
    const { id, plan } = timelinePlan(declaration);
    const exports = new Map(plan.fragment.exports.map((item) => [item.name, item.type]));
    return plan.outputNames.map((item) => componentBinding(
      id,
      item.port,
      `${id}.${item.suffix}`,
      exports.get(item.port)!,
    ));
  },
  async compile({ declaration, resolveReference }) {
    const { id, plan } = timelinePlan(declaration);
    const clock = await resolved(declaration, "clock", timelineTypes.clock, resolveReference);
    const staticClock = clock.record?.value as unknown as Clock | undefined;
    if (staticClock !== undefined) {
      for (const item of plan.inlineInputs) {
        if (!sameType(item.type, timelineAuthorTypes.duration)) continue;
        try {
          constructionDuration(staticClock, (item.value as ConstructionDurationSpec).duration);
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          const { numerator, denominator } = staticClock.frameRate;
          throw new Error(`Timeline ${id} at ${numerator}/${denominator} fps: ${error.message}`);
        }
      }
    }
    const childRange = (declarationId: string | undefined) => {
      if (declarationId === undefined) return declaration.range;
      return declaration.children.find((child) => {
        const id = field(child, "id");
        return id?.kind === "literal" && id.value === declarationId;
      })?.range ?? declaration.range;
    };
    const extentReferences = new Map<string, AuthorResolvedReference>();
    for (const [index, child] of declaration.children.entries()) {
      const value = field(child, "for");
      if (value?.kind !== "reference") continue;
      const reference = await resolveReference(value.path);
      if (reference === undefined || !sameType(reference.type, temporalTypes.extent)) {
        throw new Error(`Timeline Window ${literal(child, "id")} has no resolved Extent.`);
      }
      extentReferences.set(`extent-${index + 1}`, reference);
    }
    const headerRecord = `${id}.__header`;
    const records = [{
      id: headerRecord,
      type: timelineAuthorTypes.header,
      value: canonicalize({ id }),
      range: declaration.range,
    }, ...plan.inlineInputs.map((item) => ({
      id: `${id}.__${item.name}`,
      type: item.type,
      value: canonicalize(item.value),
      range: childRange(item.author?.declarationId),
    }))];
    const inputs = {
      header: { kind: "record" as const, id: headerRecord },
      clock: clock.ref,
      ...Object.fromEntries(plan.inlineInputs.map((item) => [item.name, { kind: "record" as const, id: `${id}.__${item.name}` }])),
      ...Object.fromEntries(plan.extentInputs.map((item) => {
        const extent = extentReferences.get(item.name);
        if (extent === undefined) throw new Error(`Timeline Window ${item.declarationId} has no resolved Extent.`);
        return [item.name, extent.ref];
      })),
    };
    const outputs = Object.fromEntries(plan.outputNames.map((item) => [item.port, `${id}.${item.suffix}`]));
    return { records, components: [{ id, fragment: plan.fragment, inputs, outputs, range: declaration.range }] };
  },
};

type InstantDraft =
  | { readonly kind: "expression"; readonly expression: TemporalInstantExpression; readonly binding?: string }
  | { readonly kind: "reference"; readonly reference: AuthorResolvedReference };
type ExtentDraft =
  | { readonly kind: "duration"; readonly duration: TemporalDuration; readonly binding: string }
  | { readonly kind: "reference"; readonly reference: AuthorResolvedReference };

async function instantDraft(
  declaration: AuthorDeclaration,
  name: string,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<InstantDraft | undefined> {
  const value = field(declaration, name);
  if (value === undefined) return undefined;
  if (value.kind === "literal") return {
    kind: "expression", expression: parseTimelineInstantExpression(value.value, `${declaration.name}.${name}`), binding: name,
  };
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, temporalTypes.instant)) {
    throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  }
  return { kind: "reference", reference };
}

async function extentDraft(
  declaration: AuthorDeclaration,
  name: string,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<ExtentDraft | undefined> {
  const value = field(declaration, name);
  if (value === undefined) return undefined;
  if (value.kind === "literal") return {
    kind: "duration", duration: parseTemporalDuration(value.value, `${declaration.name}.${name}`), binding: name,
  };
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, temporalTypes.extent)) {
    throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  }
  return { kind: "reference", reference };
}

function compileWindow(
  declaration: AuthorDeclaration,
  id: string,
  timeline: AuthorResolvedReference,
  startDraft: InstantDraft,
  endDraft: InstantDraft | undefined,
  extent: ExtentDraft | undefined,
  direction: 1 | -1 | undefined,
): AuthorDeclarationOutput {
  const ports: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "window-spec", type: temporalTypes.windowSpec },
  ];
  const bindings: Record<string, AuthorResolvedReference["ref"] | { kind: "record"; id: string }> = {
    timeline: timeline.ref,
    "window-spec": { kind: "record", id: `${id}.__temporal.window` },
  };
  const records: AuthorDeclarationOutput["records"][number][] = [{
    id: `${id}.__temporal.window`, type: temporalTypes.windowSpec,
    value: canonicalize({ id, subjectId: id }), range: declaration.range,
  }];
  const operations: FragmentOperation[] = [];
  const materialize = (name: "start" | "end", draft: InstantDraft): FragmentOperationRef => {
    if (draft.kind === "reference") {
      const port = `${name}-instant`;
      ports.push({ name: port, type: temporalTypes.instant });
      bindings[port] = draft.reference.ref;
      const operationId = `reuse-${name}`;
      operations.push({ id: operationId, producer: temporalProducers.reuseInstant,
        inputs: { instant: input(port) }, result: { kind: "output" as const, name: "instant" } });
      return operation(operationId);
    }
    const port = `${name}-spec`;
    const recordId = `${id}.__temporal.${name}`;
    ports.push({ name: port, type: temporalTypes.instantSpec });
    bindings[port] = { kind: "record", id: recordId };
    records.push({ id: recordId, type: temporalTypes.instantSpec, value: canonicalize({
      id: `${id}.${name}`, subjectId: id, projection: draft.expression,
      ...(draft.binding === undefined ? {} : { author: { binding: draft.binding, relation: "direct" } }),
    }), range: declaration.range });
    const operationId = `materialize-${name}`;
    operations.push({ id: operationId, producer: temporalProducers.projectProgramInstant,
      inputs: { timeline: input("timeline"), spec: input(port) }, result: { kind: "output" as const, name: "instant" } });
    return operation(operationId);
  };
  let start = materialize("start", startDraft);
  let end = endDraft === undefined ? undefined : materialize("end", endDraft);
  if (extent !== undefined) {
    let extentRef: FragmentOperationRef | ReturnType<typeof input>;
    if (extent.kind === "reference") {
      ports.push({ name: "extent", type: temporalTypes.extent });
      bindings.extent = extent.reference.ref;
      extentRef = input("extent");
    } else {
      ports.push({ name: "duration", type: temporalTypes.duration });
      const durationId = `${id}.__temporal.duration`;
      bindings.duration = { kind: "record", id: durationId };
      records.push({ id: durationId, type: temporalTypes.duration, value: canonicalize(extent.duration), range: declaration.range });
      operations.push({ id: "resolve-extent", producer: temporalProducers.extentFromDuration,
        inputs: { timeline: input("timeline"), duration: input("duration") }, result: { kind: "output" as const, name: "extent" } });
      extentRef = operation("resolve-extent");
    }
    if (direction === undefined) throw new Error("Temporal Window shift has no direction.");
    const base = direction === 1 ? start : end;
    if (base === undefined) throw new Error("Temporal Window shift has no base Instant.");
    ports.push({ name: "shift-spec", type: temporalTypes.shiftSpec });
    const shiftId = `${id}.__temporal.shift`;
    bindings["shift-spec"] = { kind: "record", id: shiftId };
    records.push({ id: shiftId, type: temporalTypes.shiftSpec, value: canonicalize({
      id: `${id}.${direction === 1 ? "end" : "start"}`, subjectId: id, direction,
      ...(extent.kind === "duration" ? { author: {
        binding: extent.binding, relation: direction === 1 ? "after-start" : "before-end",
      } } : {}),
    }), range: declaration.range });
    operations.push({ id: "shift", producer: temporalProducers.shiftInstant,
      inputs: { timeline: input("timeline"), instant: base, extent: extentRef, spec: input("shift-spec") },
      result: { kind: "output" as const, name: "instant" } });
    if (direction === 1) end = operation("shift"); else start = operation("shift");
  }
  if (end === undefined) throw new Error("Temporal Window has no end Instant.");
  operations.push({ id: "compose", producer: temporalProducers.composeWindow,
    inputs: { spec: input("window-spec"), start, end }, result: { kind: "output" as const, name: "window" } });
  const fragment = sealGraphFragment({ inputs: ports, operations, exports: [
    { name: "window", type: temporalTypes.window, root: operation("compose") },
    { name: "start", type: temporalTypes.instant, root: start },
    { name: "end", type: temporalTypes.instant, root: end },
  ] });
  const componentId = `${id}.__temporal`;
  return {
    records,
    components: [{ id: componentId, fragment, inputs: bindings,
      outputs: { window: id, start: `${id}.start`, end: `${id}.end` }, range: declaration.range }],
  };
}

const standaloneOutputs = [temporalTypes.duration, temporalTypes.extent, temporalTypes.shiftSpec,
  temporalTypes.instantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window];

export const absoluteWindowAuthorDeclaration: AuthorDeclarationCompiler = {
  module: timelineAuthorModuleRef,
  declaration: "window",
  outputs: standaloneOutputs,
  shape: {
    summary: "Publishes one reusable absolute Window and its boundaries.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Window." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects its Timeline." },
      { name: "from", kind: "expression", required: false, accepts: [temporalTypes.instant], summary: "Chooses the start." },
      { name: "until", kind: "expression", required: false, accepts: [temporalTypes.instant], summary: "Chooses the end." },
      { name: "for", kind: "expression", required: false, accepts: [temporalTypes.extent], summary: "Chooses the duration." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [
      componentBinding(`${id}.__temporal`, "window", id, temporalTypes.window),
      componentBinding(`${id}.__temporal`, "start", `${id}.start`, temporalTypes.instant),
      componentBinding(`${id}.__temporal`, "end", `${id}.end`, temporalTypes.instant),
    ];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const from = await instantDraft(declaration, "from", resolveReference);
    const until = await instantDraft(declaration, "until", resolveReference);
    const length = await extentDraft(declaration, "for", resolveReference);
    if (Number(from !== undefined) + Number(until !== undefined) + Number(length !== undefined) !== 2) {
      throw new Error("Window requires exactly two of from, until and for.");
    }
    if (from !== undefined && until !== undefined) return compileWindow(declaration, id, timeline, from, until, undefined, undefined);
    if (from !== undefined && length !== undefined) return compileWindow(declaration, id, timeline, from, undefined, length, 1);
    if (until === undefined || length === undefined) throw new Error("Window form is incomplete.");
    return compileWindow(declaration, id, timeline,
      { kind: "expression", expression: { ref: "timeline.start" } }, until, length, -1);
  },
};

export const absoluteInstantAuthorDeclaration: AuthorDeclarationCompiler = {
  module: timelineAuthorModuleRef,
  declaration: "instant",
  outputs: standaloneOutputs,
  shape: {
    summary: "Publishes one reusable absolute Instant.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Instant." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects its Timeline." },
      { name: "at", kind: "expression", required: true, accepts: [temporalTypes.instant], summary: "Chooses a point or existing Instant." },
      { name: "offset", kind: "literal", required: false, summary: "Offsets a referenced Instant." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [componentBinding(`${id}.__temporal`, "instant", id, temporalTypes.instant)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const at = await instantDraft(declaration, "at", resolveReference);
    if (at === undefined) throw new Error("Instant.at is required.");
    const offset = optionalLiteral(declaration, "offset");
    if (at.kind === "expression") {
      if (offset !== undefined) throw new Error("Instant.offset is only valid when at references an existing Instant.");
      const specId = `${id}.__temporal.instant`;
      const fragment = sealGraphFragment({ inputs: [
        { name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: temporalTypes.instantSpec },
      ], operations: [{ id: "materialize", producer: temporalProducers.projectProgramInstant,
        inputs: { timeline: input("timeline"), spec: input("spec") }, result: { kind: "output" as const, name: "instant" } }],
      exports: [{ name: "instant", type: temporalTypes.instant, root: operation("materialize") }] });
      return {
        records: [{ id: specId, type: temporalTypes.instantSpec, value: canonicalize({
          id, subjectId: id, projection: at.expression, author: { binding: "at", relation: "direct" },
        }), range: declaration.range }],
        components: [{ id: `${id}.__temporal`, fragment, inputs: {
          timeline: timeline.ref, spec: { kind: "record", id: specId },
        }, outputs: { instant: id }, range: declaration.range }],
      };
    }
    if (offset === undefined) {
      throw new Error("Instant.at aliases an existing Instant; reference it directly or add an exact offset.");
    }
    const shift = signedDuration(offset, "Instant.offset");
    const durationId = `${id}.__temporal.duration`;
    const shiftId = `${id}.__temporal.shift`;
    const fragment = sealGraphFragment({ inputs: [
      { name: "timeline", type: timelineTypes.timeline }, { name: "instant", type: temporalTypes.instant },
      { name: "duration", type: temporalTypes.duration }, { name: "spec", type: temporalTypes.shiftSpec },
    ], operations: [{ id: "extent", producer: temporalProducers.extentFromDuration,
      inputs: { timeline: input("timeline"), duration: input("duration") }, result: { kind: "output" as const, name: "extent" } },
    { id: "shift", producer: temporalProducers.shiftInstant,
      inputs: { timeline: input("timeline"), instant: input("instant"), extent: operation("extent"), spec: input("spec") },
      result: { kind: "output" as const, name: "instant" } }],
    exports: [{ name: "instant", type: temporalTypes.instant, root: operation("shift") }] });
    return {
      records: [
        { id: durationId, type: temporalTypes.duration, value: canonicalize(shift.duration), range: declaration.range },
        { id: shiftId, type: temporalTypes.shiftSpec, value: canonicalize({
          id, subjectId: id, direction: shift.direction, author: { binding: "offset", relation: "direct" },
        }), range: declaration.range },
      ],
      components: [{ id: `${id}.__temporal`, fragment, inputs: {
        timeline: timeline.ref, instant: at.reference.ref,
        duration: { kind: "record", id: durationId }, spec: { kind: "record", id: shiftId },
      }, outputs: { instant: id }, range: declaration.range }],
    };
  },
};

export const timelineAuthorDeclarations = [
  timelineAuthorDeclaration,
  clockAuthorDeclaration,
  absoluteWindowAuthorDeclaration,
  absoluteInstantAuthorDeclaration,
] as const;

export const timelineAuthorMarkupDeclarations = [{
  name: "timeline", tag: "Timeline",
}, {
  name: "clock", tag: "Clock",
}, {
  name: "window", tag: "Window",
}, {
  name: "instant", tag: "Instant",
}] as const;
