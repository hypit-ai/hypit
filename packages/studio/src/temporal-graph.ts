import { sameType } from "@hypit/protocol";
import type { BuildState, ProducerStep, StoredValue, TypedRecord } from "@hypit/protocol";
import { temporalModuleRef, temporalTypes } from "@hypit/temporal";
import type {
  StudioTemporalBinding,
  StudioTemporalAuthority,
  StudioTemporalInstantProjection,
  StudioTemporalProjection,
  StudioTemporalSource,
} from "@hypit/studio-adapter";

type PointExpression = {
  readonly ref?: string;
  readonly offset?: unknown;
  readonly at?: unknown;
};

function inline(value: StoredValue): unknown | undefined {
  return value.kind === "inline" ? value.value : undefined;
}

function duration(value: unknown): string {
  const item = value as {
    readonly unit?: string;
    readonly value?: number;
    readonly numerator?: number;
    readonly denominator?: number;
  } | undefined;
  if (item?.unit === "frames") return `${item.value ?? 0}f`;
  if (item?.unit === "milliseconds") return `${item.value ?? 0}ms`;
  if (item?.unit === "seconds") return item.denominator === 1
    ? `${item.numerator ?? 0}s`
    : `${item.numerator ?? 0}/${item.denominator ?? 1}s`;
  return "?";
}

function signed(value: unknown): string {
  const item = value as { readonly unit?: string; readonly value?: number; readonly numerator?: number } | undefined;
  if (item === undefined) return "+?";
  const negative = item.unit === "seconds" ? (item.numerator ?? 0) < 0 : (item.value ?? 0) < 0;
  if (!negative) return `+${duration(value)}`;
  return item.unit === "seconds"
    ? `-${duration({ ...item, numerator: Math.abs(item.numerator ?? 0) })}`
    : `-${duration({ ...item, value: Math.abs(item.value ?? 0) })}`;
}

function expression(value: unknown): string {
  const point = value as PointExpression;
  if (point.ref === "absolute") return duration(point.at);
  if (typeof point.ref !== "string") return "?";
  return point.offset === undefined ? point.ref : `${point.ref}${signed(point.offset)}`;
}

function source(value: unknown): StudioTemporalSource | undefined {
  const held = value as {
    readonly spaceId?: unknown;
    readonly narrativeId?: unknown;
    readonly kind?: unknown;
    readonly id?: unknown;
  } | undefined;
  if (held?.kind !== "program" && held?.kind !== "selection"
    && held?.kind !== "segment" && held?.kind !== "moment") return undefined;
  if (typeof held.spaceId !== "string" || typeof held.narrativeId !== "string" || typeof held.id !== "string") {
    return undefined;
  }
  return {
    spaceId: held.spaceId,
    narrativeId: held.narrativeId,
    kind: held.kind,
    id: held.id,
  };
}

function instant(value: unknown): StudioTemporalInstantProjection | undefined {
  const held = value as {
    readonly source?: unknown;
    readonly projection?: unknown;
    readonly authority?: {
      readonly kind?: unknown;
      readonly boundary?: unknown;
      readonly binding?: unknown;
      readonly relation?: unknown;
    };
    readonly frame?: unknown;
  } | undefined;
  if (held === undefined) return undefined;
  const temporalSource = source(held.source);
  if (temporalSource === undefined || !Number.isSafeInteger(held.frame)) return undefined;
  const point = held.projection as PointExpression | undefined;
  const reference = point?.ref;
  if (reference !== "program.start" && reference !== "program.end"
    && reference !== "selection.start" && reference !== "selection.end"
    && reference !== "segment.start" && reference !== "segment.end"
    && reference !== "moment.cue" && reference !== "absolute") return undefined;
  const authority = held?.authority;
  let resolvedAuthority: StudioTemporalAuthority | undefined;
  if (authority?.kind === "semantic"
    && (authority.boundary === "start" || authority.boundary === "end" || authority.boundary === "cue")) {
    resolvedAuthority = { kind: "semantic", source: temporalSource, boundary: authority.boundary };
  } else if (authority?.kind === "parameter" && typeof authority.binding === "string"
    && (authority.relation === "direct" || authority.relation === "after-start" || authority.relation === "before-end")) {
    resolvedAuthority = { kind: "parameter", binding: authority.binding, relation: authority.relation };
  } else if (authority?.kind === "fixed") {
    resolvedAuthority = { kind: "fixed" };
  }
  if (resolvedAuthority === undefined) return undefined;
  return {
    kind: "instant",
    expression: expression(held.projection),
    reference,
    frame: held.frame as number,
    source: temporalSource,
    authority: resolvedAuthority,
  };
}

function projection(record: TypedRecord): {
  readonly id: string;
  readonly subjectId: string;
  readonly projection: StudioTemporalProjection;
} | undefined {
  const held = inline(record.value) as {
    readonly id?: unknown;
    readonly subjectId?: unknown;
    readonly start?: unknown;
    readonly end?: unknown;
    readonly span?: { readonly startFrame?: unknown; readonly endFrameExclusive?: unknown };
  } | undefined;
  if (typeof held?.id !== "string" || typeof held.subjectId !== "string") return undefined;
  if (sameType(record.type, temporalTypes.instant)) {
    const projected = instant(inline(record.value));
    return projected === undefined ? undefined : { id: held.id, subjectId: held.subjectId, projection: projected };
  }
  const start = instant(held.start);
  const end = instant(held.end);
  if (start === undefined || end === undefined) return undefined;
  if (!Number.isSafeInteger(held.span?.startFrame) || !Number.isSafeInteger(held.span?.endFrameExclusive)) return undefined;
  return {
    id: held.id,
    subjectId: held.subjectId,
    projection: {
      kind: "window",
      start,
      end,
      startFrame: held.span!.startFrame as number,
      endFrameExclusive: held.span!.endFrameExclusive as number,
    },
  };
}

function recordIndex(state: BuildState): ReadonlyMap<string, TypedRecord> {
  return new Map([...state.program.records, ...state.records].map((record) => [record.id, record] as const));
}

function producingSteps(state: BuildState): ReadonlyMap<string, ProducerStep> {
  return new Map(state.plan.steps.flatMap((step) =>
    Object.values(step.outputs).map((record) => [record, step] as const)));
}

function closure(state: BuildState, output: string): ReadonlySet<string> {
  const selected = state.plan.selections.find((selection) => selection.output === output);
  if (selected === undefined) return new Set();
  const producers = producingSteps(state);
  const steps = new Set<string>();
  const records = new Set<string>();
  const visit = (record: string): void => {
    if (records.has(record)) return;
    records.add(record);
    const step = producers.get(record);
    if (step === undefined || steps.has(step.id)) return;
    steps.add(step.id);
    for (const input of Object.values(step.inputs)) visit(input);
  };
  visit(selected.record);
  return steps;
}

/**
 * Read Temporal lineage from the exact executed dependency closure of one
 * logical output. Projection and consumption are graph facts; source markup is
 * deliberately not consulted here.
 */
export function executedTemporalBindings(
  state: BuildState,
  output: string,
): readonly StudioTemporalBinding[] {
  const records = recordIndex(state);
  const producers = producingSteps(state);
  const stepIds = closure(state, output);
  const steps = state.plan.steps.filter((step) => stepIds.has(step.id));
  return [...records.values()]
    .filter((record) => sameType(record.type, temporalTypes.instant) || sameType(record.type, temporalTypes.window))
    .flatMap((record): readonly StudioTemporalBinding[] => {
      const projected = projection(record);
      if (projected === undefined) return [];
      const consumers = steps.flatMap((step) => Object.entries(step.inputs)
        .filter(([, input]) => input === record.id)
        .map(([input]) => ({
          step: step.id,
          producer: { module: { ...step.producer.module }, name: step.producer.name },
          input,
          role: step.producer.module.name === temporalModuleRef.name
            && step.producer.module.version === temporalModuleRef.version
            ? "projection" as const
            : "domain" as const,
          inputs: Object.entries(step.inputs).flatMap(([name, id]) => {
            const found = records.get(id);
            if (found === undefined) return [];
            const value = inline(found.value);
            return [{
              name,
              record: id,
              type: { module: { ...found.type.module }, name: found.type.name },
              ...(value === undefined ? {} : { value: structuredClone(value) }),
            }];
          }).sort((left, right) => left.name.localeCompare(right.name)),
        })));
      if (consumers.length === 0) return [];
      return [{
        record: record.id,
        ...projected,
        consumers: consumers.sort((left, right) => left.step.localeCompare(right.step)
          || left.input.localeCompare(right.input)),
      }];
    })
    .sort((left, right) => left.record.localeCompare(right.record));
}
