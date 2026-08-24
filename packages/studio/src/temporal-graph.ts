import type { BuildState, ProducerStep, StoredValue, TypedRecord } from "@hypit/protocol";
import type {
  StudioTemporalBinding,
  StudioTemporalProjection,
  StudioTemporalSource,
} from "@hypit/studio-adapter";

const TEMPORAL_MODULE = "@hypit/temporal";
const TEMPORAL_TYPES = new Set(["TemporalPoint", "TemporalWindow"]);

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
  const held = value as { readonly kind?: unknown; readonly id?: unknown } | undefined;
  if (held?.kind !== "program" && held?.kind !== "selection"
    && held?.kind !== "segment" && held?.kind !== "moment") return undefined;
  return {
    kind: held.kind,
    ...(typeof held.id === "string" ? { id: held.id } : {}),
  };
}

function projection(record: TypedRecord): {
  readonly id: string;
  readonly source: StudioTemporalSource;
  readonly projection: StudioTemporalProjection;
} | undefined {
  const held = inline(record.value) as {
    readonly id?: unknown;
    readonly source?: unknown;
    readonly projection?: unknown;
    readonly frame?: unknown;
    readonly span?: { readonly startFrame?: unknown; readonly endFrameExclusive?: unknown };
  } | undefined;
  const temporalSource = source(held?.source);
  if (typeof held?.id !== "string" || temporalSource === undefined) return undefined;
  if (record.type.name === "TemporalPoint") {
    if (!Number.isSafeInteger(held.frame)) return undefined;
    return {
      id: held.id,
      source: temporalSource,
      projection: {
        kind: "point",
        expression: expression(held.projection),
        frame: held.frame as number,
      },
    };
  }
  const window = held.projection as { readonly start?: unknown; readonly end?: unknown } | undefined;
  if (!Number.isSafeInteger(held.span?.startFrame) || !Number.isSafeInteger(held.span?.endFrameExclusive)) return undefined;
  return {
    id: held.id,
    source: temporalSource,
    projection: {
      kind: "window",
      startExpression: expression(window?.start),
      endExpression: expression(window?.end),
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

function specOf(step: ProducerStep | undefined, records: ReadonlyMap<string, TypedRecord>): {
  readonly record: string;
  readonly id: string;
} | undefined {
  const id = step?.inputs.spec;
  if (id === undefined) return undefined;
  const value = records.get(id);
  const spec = value === undefined ? undefined : inline(value.value) as { readonly id?: unknown } | undefined;
  return typeof spec?.id === "string" ? { record: id, id: spec.id } : undefined;
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
    .filter((record) => record.type.module.name === TEMPORAL_MODULE && TEMPORAL_TYPES.has(record.type.name))
    .flatMap((record): readonly StudioTemporalBinding[] => {
      const projected = projection(record);
      if (projected === undefined) return [];
      const spec = specOf(producers.get(record.id), records);
      const consumers = steps.flatMap((step) => Object.entries(step.inputs)
        .filter(([, input]) => input === record.id)
        .map(([input]) => ({
          step: step.id,
          producer: { module: { ...step.producer.module }, name: step.producer.name },
          input,
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
        ...(spec === undefined ? {} : { specRecord: spec.record, specId: spec.id }),
        ...projected,
        consumers: consumers.sort((left, right) => left.step.localeCompare(right.step)
          || left.input.localeCompare(right.input)),
      }];
    })
    .sort((left, right) => left.record.localeCompare(right.record));
}
