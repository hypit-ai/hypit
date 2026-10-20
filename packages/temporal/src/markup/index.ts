import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation, FragmentOperationRef } from "@hypit/hypit/author";
import type {
  MarkupAttributeValue, StructuredElement, SurfaceAttributeVocabulary, SurfaceComponentDraft,
  SurfaceRecordDraft, SurfaceResolvedReference,
} from "@hypit/hypit/markup";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { temporalProducers, temporalTypes } from "@hypit/temporal";
import type { TemporalAuthorParameter, TemporalDuration, TemporalInstantExpression } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

export * from "./context.js";

type ResolveReference = (path: string) => SurfaceResolvedReference | undefined;
type InstantDraft =
  | { readonly kind: "expression"; readonly expression: TemporalInstantExpression; readonly author?: TemporalAuthorParameter }
  | { readonly kind: "reference"; readonly reference: SurfaceResolvedReference };
type ExtentDraft =
  | { readonly kind: "duration"; readonly duration: TemporalDuration; readonly author?: TemporalAuthorParameter }
  | { readonly kind: "reference"; readonly reference: SurfaceResolvedReference };

/** Reference-only vocabulary for a Window consumer. */
export const temporalWindowAttributeVocabulary: readonly SurfaceAttributeVocabulary[] = [
  { name: "during", kind: "expression", required: false, accepts: [temporalTypes.window],
    summary: "Uses an already resolved Window." },
];
export const temporalWindowAttributeNames = temporalWindowAttributeVocabulary.map(({ name }) => name);

/** Reference-only vocabulary for an Instant consumer. */
export const temporalInstantAttributeVocabulary: readonly SurfaceAttributeVocabulary[] = [
  { name: "at", kind: "expression", required: false, accepts: [temporalTypes.instant],
    summary: "Uses an already resolved Instant." },
];
export const temporalInstantAttributeNames = temporalInstantAttributeVocabulary.map(({ name }) => name);

const temporalWindowAuthorAttributeNames = ["from", "until", "for"] as const;

export type TemporalMarkupConstruction = {
  readonly records: readonly SurfaceRecordDraft[];
  readonly components: readonly SurfaceComponentDraft[];
  readonly ref: SurfaceResolvedReference["ref"];
  readonly startRef?: SurfaceResolvedReference["ref"];
  readonly endRef?: SurfaceResolvedReference["ref"];
};

function divisor(left: number, right: number): number {
  let a = Math.abs(left), b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function parseTemporalDuration(value: string, label: string): TemporalDuration {
  const match = /^(\d+)(?:\.(\d+))?(f|ms|s)$/u.exec(value.trim());
  if (match === null) throw new Error(`${label} must be an exact duration such as 12f, 250ms or 1.5s.`);
  const whole = Number(match[1]), fraction = match[2] ?? "", unit = match[3];
  if (!Number.isSafeInteger(whole)) throw new Error(`${label} is outside safe arithmetic.`);
  if (unit === "f" || unit === "ms") {
    if (fraction.length > 0) throw new Error(`${label} ${unit} duration must be an integer.`);
    return { unit: unit === "f" ? "frames" : "milliseconds", value: whole };
  }
  const scale = 10 ** fraction.length;
  const numerator = whole * scale + (fraction.length === 0 ? 0 : Number(fraction));
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(scale)) throw new Error(`${label} is outside safe arithmetic.`);
  const gcd = divisor(numerator, scale);
  return { unit: "seconds", numerator: numerator / gcd, denominator: scale / gcd };
}

function negate(value: TemporalDuration): TemporalDuration {
  return value.unit === "seconds" ? { ...value, numerator: -value.numerator } : { ...value, value: -value.value };
}

function signedDuration(raw: MarkupAttributeValue, label: string): { readonly direction: 1 | -1; readonly duration: TemporalDuration } {
  if (typeof raw !== "string") throw new Error(`${label} must be an exact signed duration.`);
  const match = /^([+-])(.+)$/u.exec(raw.trim());
  if (match === null) throw new Error(`${label} must be an exact signed duration such as +12f or -250ms.`);
  return { direction: match[1] === "+" ? 1 : -1, duration: parseTemporalDuration(match[2]!, label) };
}

export function parseTemporalInstant(value: string, label: string): TemporalInstantExpression {
  const trimmed = value.trim();
  const aliases = [["start", "timeline.start"], ["end", "timeline.end"],
    ["timeline.start", "timeline.start"], ["timeline.end", "timeline.end"]] as const;
  for (const [spelling, ref] of aliases) {
    if (trimmed === spelling) return { ref };
    const escaped = spelling.replace(".", "\\.");
    const match = new RegExp(`^${escaped}\\s*([+-])\\s*(.+)$`, "u").exec(trimmed);
    if (match !== null) {
      const offset = parseTemporalDuration(match[2]!, `${label} offset`);
      return { ref, offset: match[1] === "-" ? negate(offset) : offset };
    }
  }
  return { ref: "absolute", at: parseTemporalDuration(trimmed, label) };
}

function resolvedReference(raw: MarkupAttributeValue, label: string, type: SurfaceResolvedReference["type"],
  resolveReference: ResolveReference): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const found = resolveReference(raw.path);
  if (found === undefined || !sameType(found.type, type)) throw new Error(`${label} has the wrong Type.`);
  return found;
}

function instantDraft(raw: MarkupAttributeValue, label: string, binding: string, resolveReference: ResolveReference): InstantDraft {
  return typeof raw === "string"
    ? { kind: "expression", expression: parseTemporalInstant(raw, label), author: { binding, relation: "direct" } }
    : { kind: "reference", reference: resolvedReference(raw, label, temporalTypes.instant, resolveReference) };
}

function extentDraft(raw: MarkupAttributeValue, label: string, binding: string, resolveReference: ResolveReference): ExtentDraft {
  return typeof raw === "string"
    ? { kind: "duration", duration: parseTemporalDuration(raw, label), author: { binding, relation: "direct" } }
    : { kind: "reference", reference: resolvedReference(raw, label, temporalTypes.extent, resolveReference) };
}

function rejectUnused(element: StructuredElement, allowed: readonly string[]): void {
  const accepted = new Set(allowed);
  const unused = temporalWindowAuthorAttributeNames.filter((name) => element.attributes[name] !== undefined && !accepted.has(name));
  if (unused.length > 0) throw new Error(`${element.name} timing form does not accept ${unused.join(", ")}.`);
}

const fragmentInput = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string): FragmentOperationRef => ({ kind: "fragment-operation", operation: id });

function constructWindow(value: {
  readonly id: string; readonly subjectId: string; readonly element: StructuredElement;
  readonly timeline: SurfaceResolvedReference; readonly start: InstantDraft; readonly end?: InstantDraft;
  readonly extent?: ExtentDraft; readonly direction?: 1 | -1;
}): TemporalMarkupConstruction {
  const ports: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "timeline", type: timelineTypes.timeline }, { name: "window-spec", type: temporalTypes.windowSpec },
  ];
  const bindings: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
    timeline: value.timeline.ref, "window-spec": { kind: "record", id: `${value.id}.__temporal.window` },
  };
  const records: SurfaceRecordDraft[] = [{ id: `${value.id}.__temporal.window`, type: temporalTypes.windowSpec,
    value: ({ id: value.id, subjectId: value.subjectId }), range: value.element.range }];
  const operations: FragmentOperation[] = [];
  const materialize = (name: "start" | "end", draft: InstantDraft): FragmentOperationRef => {
    if (draft.kind === "reference") {
      const port = `${name}-instant`;
      ports.push({ name: port, type: temporalTypes.instant });
      bindings[port] = draft.reference.ref;
      const operationId = `reuse-${name}`;
      operations.push({ id: operationId, producer: temporalProducers.reuseInstant,
        inputs: { instant: fragmentInput(port) }, result: { kind: "output" as const, name: "instant" } });
      return operation(operationId);
    }
    const port = `${name}-spec`, recordId = `${value.id}.__temporal.${name}`;
    ports.push({ name: port, type: temporalTypes.instantSpec });
    bindings[port] = { kind: "record", id: recordId };
    records.push({ id: recordId, type: temporalTypes.instantSpec, value: ({
      id: `${value.id}.${name}`, subjectId: value.subjectId, projection: draft.expression,
      ...(draft.author === undefined ? {} : { author: draft.author }),
    }), range: value.element.range });
    const operationId = `materialize-${name}`;
    operations.push({ id: operationId, producer: temporalProducers.projectProgramInstant,
      inputs: { timeline: fragmentInput("timeline"), spec: fragmentInput(port) }, result: { kind: "output" as const, name: "instant" } });
    return operation(operationId);
  };
  let start = materialize("start", value.start);
  let end = value.end === undefined ? undefined : materialize("end", value.end);
  if (value.extent !== undefined) {
    let extentRef: FragmentOperationRef | ReturnType<typeof fragmentInput>;
    if (value.extent.kind === "reference") {
      ports.push({ name: "extent", type: temporalTypes.extent });
      bindings.extent = value.extent.reference.ref;
      extentRef = fragmentInput("extent");
    } else {
      ports.push({ name: "duration", type: temporalTypes.duration });
      const durationId = `${value.id}.__temporal.duration`;
      bindings.duration = { kind: "record", id: durationId };
      records.push({ id: durationId, type: temporalTypes.duration,
        value: (value.extent.duration), range: value.element.range });
      operations.push({ id: "resolve-extent", producer: temporalProducers.extentFromDuration,
        inputs: { timeline: fragmentInput("timeline"), duration: fragmentInput("duration") }, result: { kind: "output" as const, name: "extent" } });
      extentRef = operation("resolve-extent");
    }
    const direction = value.direction;
    if (direction === undefined) throw new Error("Temporal Window shift has no direction.");
    const base = direction === 1 ? start : end;
    if (base === undefined) throw new Error("Temporal Window shift has no base Instant.");
    ports.push({ name: "shift-spec", type: temporalTypes.shiftSpec });
    const shiftId = `${value.id}.__temporal.shift`;
    bindings["shift-spec"] = { kind: "record", id: shiftId };
    records.push({ id: shiftId, type: temporalTypes.shiftSpec, value: ({
      id: `${value.id}.${direction === 1 ? "end" : "start"}`, subjectId: value.subjectId, direction,
      ...(value.extent.kind !== "duration" || value.extent.author === undefined ? {} : {
        author: { ...value.extent.author, relation: direction === 1 ? "after-start" : "before-end" },
      }),
    }), range: value.element.range });
    operations.push({ id: "shift", producer: temporalProducers.shiftInstant,
      inputs: { timeline: fragmentInput("timeline"), instant: base, extent: extentRef, spec: fragmentInput("shift-spec") },
      result: { kind: "output" as const, name: "instant" } });
    if (direction === 1) end = operation("shift"); else start = operation("shift");
  }
  if (end === undefined) throw new Error("Temporal Window has no end Instant.");
  operations.push({ id: "compose", producer: temporalProducers.composeWindow,
    inputs: { spec: fragmentInput("window-spec"), start, end }, result: { kind: "output" as const, name: "window" } });
  const fragment = sealGraphFragment({ inputs: ports, operations, exports: [
    { name: "window", type: temporalTypes.window, root: operation("compose") },
    { name: "start", type: temporalTypes.instant, root: start },
    { name: "end", type: temporalTypes.instant, root: end },
  ] });
  const componentId = `${value.id}.__temporal`;
  return { records, components: [{ id: componentId, fragment, inputs: bindings,
    outputs: { window: `${value.id}.__temporal.window.value`, start: `${value.id}.__temporal.start.value`,
      end: `${value.id}.__temporal.end.value` }, range: value.element.range }],
    ref: { kind: "component-output", component: componentId, output: "window" },
    startRef: { kind: "component-output", component: componentId, output: "start" },
    endRef: { kind: "component-output", component: componentId, output: "end" } };
}

/** Construct one named absolute Window for an author declaration. */
export function createTemporalWindowConstruction(value: {
  readonly id: string; readonly subjectId?: string; readonly element: StructuredElement;
  readonly timeline: SurfaceResolvedReference; readonly resolveReference: ResolveReference;
}): TemporalMarkupConstruction {
  const { element, resolveReference } = value;
  const from = element.attributes.from;
  const until = element.attributes.until, length = element.attributes.for;
  if (Number(from !== undefined) + Number(until !== undefined) + Number(length !== undefined) !== 2) {
    throw new Error(`${element.name} requires exactly two of from, until and for.`);
  }
  rejectUnused(element, ["from", "until", "for"]);
  const subjectId = value.subjectId ?? value.id;
  if (from !== undefined && until !== undefined) return constructWindow({ ...value, subjectId,
    start: instantDraft(from, `${element.name}.from`, "from", resolveReference),
    end: instantDraft(until, `${element.name}.until`, "until", resolveReference) });
  if (from !== undefined && length !== undefined) return constructWindow({ ...value, subjectId,
    start: instantDraft(from, `${element.name}.from`, "from", resolveReference),
    extent: extentDraft(length, `${element.name}.for`, "for", resolveReference), direction: 1 });
  if (until === undefined || length === undefined) throw new Error(`${element.name} Window form is incomplete.`);
  return constructWindow({ ...value, subjectId,
    start: { kind: "expression", expression: { ref: "timeline.start" } },
    end: instantDraft(until, `${element.name}.until`, "until", resolveReference),
    extent: extentDraft(length, `${element.name}.for`, "for", resolveReference), direction: -1 });
}

/** Construct one named absolute Instant for an author declaration. */
export function createTemporalInstantConstruction(value: {
  readonly id: string; readonly subjectId?: string; readonly element: StructuredElement;
  readonly timeline: SurfaceResolvedReference; readonly resolveReference: ResolveReference; readonly attribute?: string;
}): TemporalMarkupConstruction {
  const attribute = value.attribute ?? "at", raw = value.element.attributes[attribute];
  if (raw === undefined) throw new Error(`${value.element.name}.${attribute} is required.`);
  if (typeof raw !== "string") {
    const found = resolvedReference(raw, `${value.element.name}.${attribute}`, temporalTypes.instant, value.resolveReference);
    const rawOffset = value.element.attributes.offset;
    if (rawOffset === undefined) return { records: [], components: [], ref: found.ref };
    const offset = signedDuration(rawOffset, `${value.element.name}.offset`);
    const durationId = `${value.id}.__temporal.duration`, shiftId = `${value.id}.__temporal.shift`;
    const fragment = sealGraphFragment({ inputs: [
      { name: "timeline", type: timelineTypes.timeline }, { name: "instant", type: temporalTypes.instant },
      { name: "duration", type: temporalTypes.duration }, { name: "spec", type: temporalTypes.shiftSpec },
    ], operations: [{ id: "extent", producer: temporalProducers.extentFromDuration,
      inputs: { timeline: fragmentInput("timeline"), duration: fragmentInput("duration") },
      result: { kind: "output" as const, name: "extent" } },
    { id: "shift", producer: temporalProducers.shiftInstant,
      inputs: { timeline: fragmentInput("timeline"), instant: fragmentInput("instant"),
        extent: operation("extent"), spec: fragmentInput("spec") }, result: { kind: "output" as const, name: "instant" } }],
    exports: [{ name: "instant", type: temporalTypes.instant, root: operation("shift") }] });
    const componentId = `${value.id}.__temporal`;
    return {
      records: [
        { id: durationId, type: temporalTypes.duration, value: (offset.duration), range: value.element.range },
        { id: shiftId, type: temporalTypes.shiftSpec, value: ({
          id: value.id, subjectId: value.subjectId ?? value.id, direction: offset.direction,
          author: { binding: "offset", relation: "direct" },
        }), range: value.element.range },
      ],
      components: [{ id: componentId, fragment, inputs: {
        timeline: value.timeline.ref, instant: found.ref,
        duration: { kind: "record", id: durationId }, spec: { kind: "record", id: shiftId },
      }, outputs: { instant: `${value.id}.__temporal.instant.value` }, range: value.element.range }],
      ref: { kind: "component-output", component: componentId, output: "instant" },
    };
  }
  if (value.element.attributes.offset !== undefined) {
    throw new Error(`${value.element.name}.offset is only valid when at references an existing Instant.`);
  }
  const specId = `${value.id}.__temporal.instant`;
  const fragment = sealGraphFragment({ inputs: [
    { name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: temporalTypes.instantSpec },
  ], operations: [{ id: "materialize", producer: temporalProducers.projectProgramInstant,
    inputs: { timeline: fragmentInput("timeline"), spec: fragmentInput("spec") }, result: { kind: "output" as const, name: "instant" } }],
  exports: [{ name: "instant", type: temporalTypes.instant, root: operation("materialize") }] });
  const componentId = `${value.id}.__temporal`;
  return { records: [{ id: specId, type: temporalTypes.instantSpec, value: ({
    id: value.id, subjectId: value.subjectId ?? value.id,
    projection: parseTemporalInstant(raw, `${value.element.name}.${attribute}`),
    author: { binding: attribute, relation: "direct" },
  }), range: value.element.range }], components: [{ id: componentId, fragment,
    inputs: { timeline: value.timeline.ref, spec: { kind: "record", id: specId } },
    outputs: { instant: `${value.id}.__temporal.instant.value` }, range: value.element.range }],
  ref: { kind: "component-output", component: componentId, output: "instant" } };
}

/** Resolve one already declared Window at a consumer boundary. */
export function resolveTemporalWindowReference(value: {
  readonly element: StructuredElement;
  readonly resolveReference: ResolveReference;
  readonly attribute?: string;
}): SurfaceResolvedReference {
  const attribute = value.attribute ?? "during";
  const raw = value.element.attributes[attribute];
  if (raw === undefined) throw new Error(`${value.element.name}.${attribute} is required.`);
  return resolvedReference(raw, `${value.element.name}.${attribute}`, temporalTypes.window, value.resolveReference);
}

/** Resolve one already declared Instant at a consumer boundary. */
export function resolveTemporalInstantReference(value: {
  readonly element: StructuredElement;
  readonly resolveReference: ResolveReference;
  readonly attribute?: string;
}): SurfaceResolvedReference {
  const attribute = value.attribute ?? "at";
  const raw = value.element.attributes[attribute];
  if (raw === undefined) throw new Error(`${value.element.name}.${attribute} is required.`);
  return resolvedReference(raw, `${value.element.name}.${attribute}`, temporalTypes.instant, value.resolveReference);
}
