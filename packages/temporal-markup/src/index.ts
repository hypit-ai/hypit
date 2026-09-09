import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation, GraphFragment } from "@hypit/elaborator";
import type {
  MarkupAttributeValue,
  StructuredElement,
  SurfaceComponentDraft,
  SurfaceAttributeVocabulary,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
} from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import { createTemporalSpace } from "./space.js";
export * from "./space.js";
import { semanticTrackTypes } from "@hypit/semantic-track";
import {
  temporalProducers,
  temporalTypes,
} from "@hypit/temporal";
import type {
  TemporalDuration,
  TemporalInstantAuthority,
  TemporalInstantExpression,
} from "@hypit/temporal";

type ResolveReference = (path: string) => SurfaceResolvedReference | undefined;
type SourceKind = "program" | "selection" | "segment" | "moment";

/** Complete author vocabulary for one Window consumer. Domain packages may only add non-time fields. */
export const temporalWindowAttributeVocabulary: readonly SurfaceAttributeVocabulary[] = [
  { name: "during", kind: "expression", required: false, values: ["program"],
    accepts: [narrativeTypes.selection, narrativeTypes.excerpt],
    summary: "Uses the whole Program, or the exact window of a referenced Selection or Segment." },
  { name: "at", kind: "expression", required: false, accepts: [narrativeTypes.moment],
    summary: "Starts at a semantic Moment or authored time (2s, 60f); write it together with for." },
  { name: "until", kind: "expression", required: false, accepts: [narrativeTypes.moment],
    summary: "Ends at a semantic Moment or authored time; write it together with for." },
  { name: "for", kind: "literal", required: false,
    summary: "Sets the projected duration paired with at or until, such as 12f, 250ms or 1.5s." },
  { name: "start", kind: "literal", required: false,
    summary: "Sets a projected start expression; write it together with end." },
  { name: "end", kind: "literal", required: false,
    summary: "Sets a projected end expression; write it together with start." },
  { name: "selection", kind: "reference", required: false, accepts: [narrativeTypes.selection],
    summary: "Resolves selection.start or selection.end used by a projected start/end expression." },
  { name: "segment", kind: "reference", required: false, accepts: [narrativeTypes.excerpt],
    summary: "Resolves segment.start or segment.end used by a projected start/end expression." },
  { name: "moment", kind: "reference", required: false, accepts: [narrativeTypes.moment],
    summary: "Resolves moment.cue used by a projected start/end expression." },
];
export const temporalWindowAttributeNames = temporalWindowAttributeVocabulary.map(({ name }) => name);

/** Complete author vocabulary for a semantic or explicitly projected Instant. */
export const temporalInstantAttributeVocabulary: readonly SurfaceAttributeVocabulary[] = [
  { name: "at", kind: "expression", required: false,
    accepts: [narrativeTypes.moment, narrativeTypes.selection, narrativeTypes.excerpt],
    summary: "Uses a semantic Moment, a chosen Selection or Segment boundary, or an authored time such as 2s." },
  { name: "instant", kind: "literal", required: false,
    summary: "Uses a projected point expression, such as moment.cue + 12f or program.start + 2s." },
  { name: "boundary", kind: "literal", required: false, values: ["start", "end"],
    summary: "Chooses the start or end boundary when at references a Selection or Segment." },
  { name: "selection", kind: "reference", required: false, accepts: [narrativeTypes.selection],
    summary: "Resolves selection.start or selection.end used by an instant expression." },
  { name: "segment", kind: "reference", required: false, accepts: [narrativeTypes.excerpt],
    summary: "Resolves segment.start or segment.end used by an instant expression." },
  { name: "moment", kind: "reference", required: false, accepts: [narrativeTypes.moment],
    summary: "Resolves moment.cue used by an instant expression." },
];
export const temporalInstantAttributeNames = temporalInstantAttributeVocabulary.map(({ name }) => name);

function rejectUnusedTemporalAttributes(
  element: StructuredElement,
  universe: readonly string[],
  allowed: readonly string[],
): void {
  const accepted = new Set(allowed);
  const unused = universe.filter((name) => element.attributes[name] !== undefined && !accepted.has(name));
  if (unused.length > 0) {
    throw new Error(`${element.name} timing form does not accept ${unused.join(", ")}.`);
  }
}

type InstantDraft = {
  readonly expression: TemporalInstantExpression;
  readonly authority: TemporalInstantAuthority;
  readonly source: SourceKind;
  readonly reference?: SurfaceResolvedReference;
};

export type TemporalMarkupProjection = {
  readonly records: readonly SurfaceRecordDraft[];
  readonly components: readonly SurfaceComponentDraft[];
  readonly fragments: readonly GraphFragment[];
  readonly ref: { readonly kind: "component-output"; readonly component: string; readonly output: string };
};

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function resolve(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: ResolveReference,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const found = resolveReference(raw.path);
  if (found === undefined || !sameType(found.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return found;
}

function resolveDuring(
  raw: MarkupAttributeValue,
  label: string,
  resolveReference: ResolveReference,
): { readonly kind: "selection" | "segment"; readonly reference: SurfaceResolvedReference } {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be program or a reference.`);
  const found = resolveReference(raw.path);
  if (found !== undefined && sameType(found.type, narrativeTypes.selection)) {
    return { kind: "selection", reference: found };
  }
  if (found !== undefined && sameType(found.type, narrativeTypes.excerpt)) {
    return { kind: "segment", reference: found };
  }
  throw new Error(`${label} must reference a Selection or Segment.`);
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be text.`);
  }
  return value.trim();
}

function text(element: StructuredElement, name: string): string {
  const found = optionalText(element, name);
  if (found === undefined) throw new Error(`${element.name}.${name} is required.`);
  return found;
}

function divisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function parseTemporalDuration(value: string, label: string): TemporalDuration {
  const match = /^(\d+)(?:\.(\d+))?(f|ms|s)$/u.exec(value.trim());
  if (match === null) throw new Error(`${label} must be an exact duration such as 12f, 250ms or 1.5s.`);
  const whole = Number(match[1]);
  const fraction = match[2] ?? "";
  const unit = match[3];
  if (!Number.isSafeInteger(whole)) throw new Error(`${label} is outside safe arithmetic.`);
  if (unit === "f" || unit === "ms") {
    if (fraction.length > 0) throw new Error(`${label} ${unit} duration must be an integer.`);
    return { unit: unit === "f" ? "frames" : "milliseconds", value: whole };
  }
  const scale = 10 ** fraction.length;
  const numerator = whole * scale + (fraction.length === 0 ? 0 : Number(fraction));
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(scale)) {
    throw new Error(`${label} is outside safe arithmetic.`);
  }
  const gcd = divisor(numerator, scale);
  return { unit: "seconds", numerator: numerator / gcd, denominator: scale / gcd };
}

function negate(value: TemporalDuration): TemporalDuration {
  return value.unit === "seconds"
    ? { ...value, numerator: -value.numerator }
    : { ...value, value: -value.value };
}

export function parseTemporalInstant(value: string, label: string): TemporalInstantExpression {
  const trimmed = value.trim();
  const refs = [
    "program.start", "program.end", "selection.start", "selection.end",
    "segment.start", "segment.end", "moment.cue",
  ] as const;
  for (const ref of refs) {
    if (trimmed === ref) return { ref };
    const escaped = ref.replace(".", "\\.");
    const match = new RegExp(`^${escaped}\\s*([+-])\\s*(.+)$`, "u").exec(trimmed);
    if (match !== null) {
      const offset = parseTemporalDuration(match[2]!, `${label} offset`);
      return { ref, offset: match[1] === "-" ? negate(offset) : offset };
    }
  }
  return { ref: "absolute", at: parseTemporalDuration(trimmed, label) };
}

function expressionSource(expression: TemporalInstantExpression): SourceKind {
  if (expression.ref.startsWith("selection.")) return "selection";
  if (expression.ref.startsWith("segment.")) return "segment";
  if (expression.ref === "moment.cue") return "moment";
  return "program";
}

function sourceReference(
  element: StructuredElement,
  kind: SourceKind,
  resolveReference: ResolveReference,
): SurfaceResolvedReference | undefined {
  if (kind === "program") return undefined;
  const expected = kind === "selection"
    ? narrativeTypes.selection
    : kind === "segment" ? narrativeTypes.excerpt : narrativeTypes.moment;
  return resolve(element.attributes[kind], `${element.name}.${kind}`, expected, resolveReference);
}

function projectionFragment(input: {
  readonly output: "instant" | "window";
  readonly start: InstantDraft;
  readonly end?: InstantDraft;
}): GraphFragment {
  const fragmentInput = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
  const endpoints = input.end === undefined
    ? [["instant", input.start] as const]
    : [["start", input.start] as const, ["end", input.end] as const];
  const inputs = [
    { name: "space", type: programSpaceTypes.programSpace },
    ...(endpoints.some(([, endpoint]) => endpoint.source !== "program") ? [{ name: "semantic", type: semanticTrackTypes.track }] : []),
    ...endpoints.map(([name]) => ({ name: `${name}-spec`, type: temporalTypes.instantSpec })),
    ...endpoints.flatMap(([name, endpoint]) => endpoint.source === "program" ? [] : [{
      name: `${name}-${endpoint.source}`,
      type: endpoint.source === "selection" ? narrativeTypes.selection
        : endpoint.source === "segment" ? narrativeTypes.excerpt : narrativeTypes.moment,
    }]),
    ...(input.end === undefined ? [] : [{ name: "window-spec", type: temporalTypes.windowSpec }]),
  ];
  const operations: FragmentOperation[] = endpoints.map(([name, endpoint]) => ({
    id: `temporal:${name}`,
    producer: endpoint.source === "program" ? temporalProducers.projectProgramInstant
      : endpoint.source === "selection" ? temporalProducers.projectSelectionInstant
        : endpoint.source === "segment" ? temporalProducers.projectSegmentInstant
          : temporalProducers.projectMomentInstant,
    inputs: {
      ...(endpoint.source === "program" ? { space: fragmentInput("space") } : { semantic: fragmentInput("semantic") }),
      spec: fragmentInput(`${name}-spec`),
      ...(endpoint.source === "program" ? {} : {
        [endpoint.source]: fragmentInput(`${name}-${endpoint.source}`),
      }),
    },
    result: { kind: "output" as const, name: "instant" },
  }));
  if (input.end !== undefined) operations.push({
    id: "temporal:window",
    producer: temporalProducers.composeWindow,
    inputs: {
      spec: fragmentInput("window-spec"),
      start: operation("temporal:start"),
      end: operation("temporal:end"),
    },
    result: { kind: "output" as const, name: "window" },
  });
  return sealGraphFragment({
    inputs,
    operations,
    exports: [{
      name: input.output,
      type: input.output === "window" ? temporalTypes.window : temporalTypes.instant,
      root: operation(input.output === "window" ? "temporal:window" : "temporal:instant"),
    }],
  });
}

function projectionDraft(input: {
  readonly id: string;
  readonly subjectId?: string;
  readonly element: StructuredElement;
  readonly semantic?: SurfaceResolvedReference;
  readonly space?: SurfaceResolvedReference;
  readonly start: InstantDraft;
  readonly end?: InstantDraft;
}): TemporalMarkupProjection {
  if ([input.start, input.end].some((endpoint) => endpoint !== undefined && endpoint.source !== "program") && input.semantic === undefined) {
    throw new Error(`${input.element.name} needs semantic to resolve this Script reference.`);
  }
  const time = createTemporalSpace(input);
  const output = input.end === undefined ? "instant" : "window";
  const subjectId = input.subjectId ?? input.id;
  if (subjectId.length === 0) throw new Error("Temporal projection subjectId must not be empty.");
  const fragment = projectionFragment({ output, start: input.start, ...(input.end === undefined ? {} : { end: input.end }) });
  const componentId = `${input.id}.__temporal`;
  const records: SurfaceRecordDraft[] = [];
  const componentInputs: SurfaceComponentDraft["inputs"] extends infer _T
    ? Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }>
    : never = { space: time.space.ref, ...(input.semantic === undefined ? {} : { semantic: input.semantic.ref }) };
  if ([input.start, input.end].every((endpoint) => endpoint === undefined || endpoint.source === "program")) delete componentInputs.semantic;
  const endpoints = input.end === undefined
    ? [["instant", input.start] as const]
    : [["start", input.start] as const, ["end", input.end] as const];
  for (const [name, endpoint] of endpoints) {
    const recordId = `${input.id}.__temporal.${name}`;
    records.push({
      id: recordId,
      type: temporalTypes.instantSpec,
      value: { kind: "inline", value: {
        id: `${input.id}.${name}`,
        subjectId,
        projection: endpoint.expression,
        authority: endpoint.authority,
      } },
      range: input.element.range,
    });
    componentInputs[`${name}-spec`] = { kind: "record", id: recordId };
    if (endpoint.source !== "program") {
      if (endpoint.reference === undefined) throw new Error(`${input.id}.${name} has no ${endpoint.source} source.`);
      componentInputs[`${name}-${endpoint.source}`] = endpoint.reference.ref;
    }
  }
  if (input.end !== undefined) {
    const windowSpecId = `${input.id}.__temporal.window`;
    records.push({
      id: windowSpecId,
      type: temporalTypes.windowSpec,
      value: { kind: "inline", value: { id: input.id, subjectId } },
      range: input.element.range,
    });
    componentInputs["window-spec"] = { kind: "record", id: windowSpecId };
  }
  return {
    records,
    components: [...time.components, {
      id: componentId,
      fragment: fragment.id,
      inputs: componentInputs,
      outputs: { [output]: `${input.id}.__temporal.${output}` },
      range: input.element.range,
    }],
    fragments: [...time.fragments, fragment],
    ref: { kind: "component-output", component: componentId, output },
  };
}

/** Decode exactly one of during, at/for, until/for, or start/end. */
export function createTemporalWindowProjection(input: {
  readonly id: string;
  readonly subjectId?: string;
  readonly element: StructuredElement;
  readonly semantic?: SurfaceResolvedReference;
  readonly space?: SurfaceResolvedReference;
  readonly resolveReference: ResolveReference;
}): TemporalMarkupProjection {
  const { element, resolveReference } = input;
  const during = element.attributes.during;
  const at = element.attributes.at;
  const until = element.attributes.until;
  const start = optionalText(element, "start");
  const end = optionalText(element, "end");
  const forms = Number(during !== undefined) + Number(at !== undefined)
    + Number(until !== undefined) + Number(start !== undefined || end !== undefined);
  if (forms !== 1) {
    throw new Error(`${element.name} requires exactly one of during, at/for, until/for, or start/end.`);
  }
  if (during !== undefined) {
    rejectUnusedTemporalAttributes(element, temporalWindowAttributeNames, ["during"]);
    if (typeof during === "string") {
      if (during.trim() !== "program") throw new Error(`${element.name}.during text must be program.`);
      return projectionDraft({
        ...input,
        start: { expression: { ref: "program.start" }, authority: { kind: "fixed" }, source: "program" },
        end: { expression: { ref: "program.end" }, authority: { kind: "fixed" }, source: "program" },
      });
    }
    const bound = resolveDuring(during, `${element.name}.during`, resolveReference);
    const semantic = bound.kind === "selection";
    return projectionDraft({
      ...input,
      start: {
        expression: { ref: `${bound.kind}.start` },
        authority: semantic ? { kind: "semantic", boundary: "start" } : { kind: "fixed" },
        source: bound.kind,
        reference: bound.reference,
      },
      end: {
        expression: { ref: `${bound.kind}.end` },
        authority: semantic ? { kind: "semantic", boundary: "end" } : { kind: "fixed" },
        source: bound.kind,
        reference: bound.reference,
      },
    });
  }
  if (at !== undefined || until !== undefined) {
    const name = at !== undefined ? "at" : "until";
    rejectUnusedTemporalAttributes(element, temporalWindowAttributeNames, [name, "for"]);
    const raw = at ?? until;
    const moment = typeof raw === "string" ? undefined : resolve(raw, `${element.name}.${name}`, narrativeTypes.moment, resolveReference);
    const length = parseTemporalDuration(text(element, "for"), `${element.name}.for`);
    const cue: InstantDraft = {
      expression: typeof raw === "string" ? { ref: "absolute", at: parseTemporalDuration(raw, `${element.name}.${name}`) } : { ref: "moment.cue" },
      authority: moment === undefined ? { kind: "parameter", binding: name, relation: "direct" } : { kind: "semantic", boundary: "cue" },
      source: moment === undefined ? "program" : "moment",
      ...(moment === undefined ? {} : { reference: moment }),
    };
    const derived: InstantDraft = {
      expression: { ...cue.expression, offset: at !== undefined ? length : negate(length) },
      authority: {
        kind: "parameter",
        binding: "for",
        relation: at !== undefined ? "after-start" : "before-end",
      },
      source: cue.source,
      ...(moment === undefined ? {} : { reference: moment }),
    };
    return projectionDraft({
      ...input,
      start: at !== undefined ? cue : derived,
      end: at !== undefined ? derived : cue,
    });
  }
  if (start === undefined || end === undefined) {
    throw new Error(`${element.name} explicit timing requires both start and end.`);
  }
  const startExpression = parseTemporalInstant(start, `${element.name}.start`);
  const endExpression = parseTemporalInstant(end, `${element.name}.end`);
  const startSource = expressionSource(startExpression);
  const endSource = expressionSource(endExpression);
  rejectUnusedTemporalAttributes(element, temporalWindowAttributeNames, [
    "start", "end",
    ...(startSource === "program" ? [] : [startSource]),
    ...(endSource === "program" ? [] : [endSource]),
  ]);
  const startReference = startSource === "program" ? undefined : sourceReference(element, startSource, resolveReference);
  const endReference = endSource === "program" ? undefined : sourceReference(element, endSource, resolveReference);
  return projectionDraft({
    ...input,
    start: {
      expression: startExpression,
      authority: { kind: "parameter", binding: "start", relation: "direct" },
      source: startSource,
      ...(startReference === undefined ? {} : { reference: startReference }),
    },
    end: {
      expression: endExpression,
      authority: { kind: "parameter", binding: "end", relation: "direct" },
      source: endSource,
      ...(endReference === undefined ? {} : { reference: endReference }),
    },
  });
}

/** Decode a semantic reference, an authored at time, or a projected instant expression. */
export function createTemporalInstantProjection(input: {
  readonly id: string;
  readonly subjectId?: string;
  readonly element: StructuredElement;
  readonly semantic?: SurfaceResolvedReference;
  readonly space?: SurfaceResolvedReference;
  readonly resolveReference: ResolveReference;
  readonly semanticAttribute?: string;
  readonly boundaryAttribute?: string;
  readonly boundaryFallback?: "start" | "end";
  readonly projectedAttribute?: string | false;
}): TemporalMarkupProjection {
  const semanticAttribute = input.semanticAttribute ?? "at";
  const boundaryAttribute = input.boundaryAttribute ?? "boundary";
  const projectedAttribute = input.projectedAttribute === undefined ? "instant" : input.projectedAttribute;
  const at = input.element.attributes[semanticAttribute];
  const explicit = projectedAttribute === false ? undefined : optionalText(input.element, projectedAttribute);
  const universe = [...new Set([
    ...temporalInstantAttributeNames,
    semanticAttribute,
    boundaryAttribute,
    ...(projectedAttribute === false ? [] : [projectedAttribute]),
  ])];
  if (Number(at !== undefined) + Number(explicit !== undefined) !== 1) {
    throw new Error(`${input.element.name} requires exactly one of ${semanticAttribute}${projectedAttribute === false ? "" : ` or ${projectedAttribute}`}.`);
  }
  if (at !== undefined) {
    if (typeof at === "string") {
      rejectUnusedTemporalAttributes(input.element, universe, [semanticAttribute]);
      return projectionDraft({ ...input, start: {
        expression: { ref: "absolute", at: parseTemporalDuration(at, `${input.element.name}.${semanticAttribute}`) },
        authority: { kind: "parameter", binding: semanticAttribute, relation: "direct" }, source: "program",
      } });
    }
    const found = input.resolveReference(at.path);
    if (found === undefined) throw new Error(`${input.element.name}.${semanticAttribute} is unresolved.`);
    if (sameType(found.type, narrativeTypes.moment)) {
      if (input.element.attributes[boundaryAttribute] !== undefined) {
        throw new Error(`${input.element.name}.${boundaryAttribute} is invalid for a Moment.`);
      }
      rejectUnusedTemporalAttributes(input.element, universe, [semanticAttribute]);
      return projectionDraft({
        ...input,
        start: {
          expression: { ref: "moment.cue" },
          authority: { kind: "semantic", boundary: "cue" },
          source: "moment",
          reference: found,
        },
      });
    }
    const source = sameType(found.type, narrativeTypes.selection) ? "selection"
      : sameType(found.type, narrativeTypes.excerpt) ? "segment" : undefined;
    if (source === undefined) {
      throw new Error(`${input.element.name}.${semanticAttribute} must reference a Moment, Selection or Segment.`);
    }
    const boundary = optionalText(input.element, boundaryAttribute) ?? input.boundaryFallback;
    if (boundary !== "start" && boundary !== "end") {
      throw new Error(`${input.element.name}.${boundaryAttribute} must be start or end.`);
    }
    rejectUnusedTemporalAttributes(input.element, universe, [semanticAttribute, boundaryAttribute]);
    return projectionDraft({
      ...input,
      start: {
        expression: { ref: `${source}.${boundary}` },
        authority: source === "selection" ? { kind: "semantic", boundary } : { kind: "fixed" },
        source,
        reference: found,
      },
    });
  }
  const expression = parseTemporalInstant(explicit!, `${input.element.name}.${projectedAttribute || "instant"}`);
  const source = expressionSource(expression);
  rejectUnusedTemporalAttributes(input.element, universe, [
    projectedAttribute || "instant",
    ...(source === "program" ? [] : [source]),
  ]);
  const reference = source === "program" ? undefined : sourceReference(input.element, source, input.resolveReference);
  return projectionDraft({
    ...input,
    start: {
      expression,
      authority: { kind: "parameter", binding: projectedAttribute || "instant", relation: "direct" },
      source,
      ...(reference === undefined ? {} : { reference }),
    },
  });
}
