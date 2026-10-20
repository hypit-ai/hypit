import { sameType } from "@hypit/hypit/protocol";
import type { BuildState, ProducerRef, ProducerStep, Value, TypeRef, TypedRecord } from "@hypit/hypit/protocol";
import type { BuildCandidateSelection } from "@hypit/hypit/kernel";
import { temporalTypes } from "@hypit/temporal";
import type {
  StudioTemporalBinding,
  StudioTemporalInstantProjection,
  StudioTemporalProjection,
  StudioTemporalRelationCompanion,
  StudioTemporalRelationTrace,
  StudioTemporalRelationValue,
} from "@hypit/studio-companion";

export type IdentifyTemporalSource = (type: TypeRef, value: unknown) => {
  readonly companion: string;
  readonly id: string;
  readonly kind: string;
  readonly itemId: string;
} | undefined;

export type FindTemporalRelation = (
  producer: ProducerRef,
  output: string,
) => StudioTemporalRelationCompanion | undefined;

/** Executed graph facts needed for Studio lineage; scheduling and Runtime state stay outside this boundary. */
export type ExecutedGraph = Pick<BuildState, "program" | "plan" | "records">;

function valueOf(value: Value): unknown | undefined {
  return value;
}

function recordIndex(state: ExecutedGraph): ReadonlyMap<string, TypedRecord> {
  return new Map([...state.program.records, ...state.records].map((record) => [record.id, record] as const));
}

function producingSteps(state: ExecutedGraph): ReadonlyMap<string, ProducerStep> {
  return new Map(state.plan.steps
    .filter((step) => step.result.kind === "output")
    .map((step) => [step.result.record, step] as const));
}

function relationValue(records: ReadonlyMap<string, TypedRecord>, id: string): StudioTemporalRelationValue | undefined {
  const found = records.get(id);
  return found === undefined ? undefined : { record: id, type: found.type, value: valueOf(found.value) };
}

function fixedInstant(record: TypedRecord): StudioTemporalInstantProjection | undefined {
  const held = valueOf(record.value) as {
    readonly id?: unknown;
    readonly timelineId?: unknown;
    readonly frame?: unknown;
  } | undefined;
  return typeof held?.id !== "string" || typeof held.timelineId !== "string" || !Number.isSafeInteger(held.frame)
    ? undefined
    : {
        kind: "instant",
        expression: `${held.frame as number}f`,
        reference: "absolute",
        frame: held.frame as number,
        source: { timelineId: held.timelineId, type: record.type, kind: "resolved", id: held.id },
        authority: { kind: "fixed" },
      };
}

function fixedWindow(record: TypedRecord): StudioTemporalProjection | undefined {
  const held = valueOf(record.value) as {
    readonly start?: unknown;
    readonly end?: unknown;
    readonly span?: { readonly startFrame?: unknown; readonly endFrameExclusive?: unknown };
  } | undefined;
  const startRecord: TypedRecord = { ...record, id: `${record.id}:start`,
    value: (held?.start as import("@hypit/hypit/protocol").CanonicalValue) };
  const endRecord: TypedRecord = { ...record, id: `${record.id}:end`,
    value: (held?.end as import("@hypit/hypit/protocol").CanonicalValue) };
  const start = fixedInstant(startRecord);
  const end = fixedInstant(endRecord);
  return start === undefined || end === undefined || !Number.isSafeInteger(held?.span?.startFrame)
    || !Number.isSafeInteger(held?.span?.endFrameExclusive)
    ? undefined
    : {
        kind: "window",
        start,
        end,
        startFrame: held!.span!.startFrame as number,
        endFrameExclusive: held!.span!.endFrameExclusive as number,
      };
}

function traceRecord(input: {
  readonly record: string;
  readonly records: ReadonlyMap<string, TypedRecord>;
  readonly producers: ReadonlyMap<string, ProducerStep>;
  readonly identify?: IdentifyTemporalSource;
  readonly relationFor?: FindTemporalRelation;
  readonly active: ReadonlySet<string>;
}): StudioTemporalRelationTrace | undefined {
  const record = input.records.get(input.record);
  if (record === undefined || input.active.has(input.record)) return undefined;
  const step = input.producers.get(input.record);
  if (step !== undefined && input.relationFor !== undefined) {
    const outputName = step.result.kind === "output" && step.result.record === input.record
      ? step.result.name
      : undefined;
    const relation = outputName === undefined ? undefined : input.relationFor(step.producer, outputName);
    if (relation?.trace !== undefined) {
      const output = relationValue(input.records, input.record);
      if (output === undefined) return undefined;
      const inputs = Object.fromEntries(Object.entries(step.inputs).flatMap(([name, id]) => {
        const value = relationValue(input.records, id);
        return value === undefined ? [] : [[name, value]];
      }));
      const active = new Set(input.active).add(input.record);
      return relation.trace({
        output,
        inputs,
        trace: (name) => {
          const child = step.inputs[name];
          return child === undefined ? undefined : traceRecord({ ...input, record: child, active });
        },
        identify: (name) => {
          const child = step.inputs[name];
          const value = child === undefined ? undefined : relationValue(input.records, child);
          const found = value === undefined ? undefined : input.identify?.(value.type, value.value);
          return found === undefined ? undefined : { ...found, domainId: found.id };
        },
      });
    }
  }
  if (sameType(record.type, temporalTypes.instant)) return fixedInstant(record);
  if (sameType(record.type, temporalTypes.window)) return fixedWindow(record);
  return undefined;
}

/** Read one exact executed Temporal record through package-owned relation semantics. */
export function executedTemporalProjection(
  state: ExecutedGraph,
  record: string,
  identify?: IdentifyTemporalSource,
  relationFor?: FindTemporalRelation,
): StudioTemporalProjection | undefined {
  const records = recordIndex(state);
  const traced = traceRecord({ record, records, producers: producingSteps(state), active: new Set(),
    ...(identify === undefined ? {} : { identify }), ...(relationFor === undefined ? {} : { relationFor }) });
  return traced?.kind === "instant" || traced?.kind === "window" ? traced : undefined;
}

function closure(
  state: ExecutedGraph,
  selections: readonly Pick<BuildCandidateSelection, "output" | "record">[],
  output: string,
): ReadonlySet<string> {
  const selected = selections.find((selection) => selection.output === output);
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
    for (const child of Object.values(step.inputs)) visit(child);
  };
  visit(selected.record);
  return steps;
}

/**
 * Read Temporal lineage from one executed output closure. Studio follows graph
 * identity; packages explain relation meaning through their Companions.
 */
export function executedTemporalBindings(
  state: ExecutedGraph,
  selections: readonly Pick<BuildCandidateSelection, "output" | "record">[],
  output: string,
  identify?: IdentifyTemporalSource,
  relationFor?: FindTemporalRelation,
): readonly StudioTemporalBinding[] {
  const records = recordIndex(state);
  const producers = producingSteps(state);
  const stepIds = closure(state, selections, output);
  const steps = state.plan.steps.filter((step) => stepIds.has(step.id));
  return [...records.values()]
    .filter((record) => sameType(record.type, temporalTypes.instant) || sameType(record.type, temporalTypes.window))
    .flatMap((record): readonly StudioTemporalBinding[] => {
      const held = valueOf(record.value) as { readonly id?: unknown; readonly subjectId?: unknown } | undefined;
      if (typeof held?.id !== "string" || typeof held.subjectId !== "string") return [];
      const projection = executedTemporalProjection(state, record.id, identify, relationFor);
      if (projection === undefined) return [];
      const consumers = steps.flatMap((step) => Object.entries(step.inputs)
        .filter(([, child]) => child === record.id)
        .map(([name]) => {
          const produced = step.result.kind === "output" ? records.get(step.result.record) : undefined;
          const producesTemporal = produced !== undefined
            && (sameType(produced.type, temporalTypes.instant) || sameType(produced.type, temporalTypes.window));
          return {
            step: step.id,
            producer: { module: { ...step.producer.module }, name: step.producer.name },
            input: name,
            role: producesTemporal ? "projection" as const : "domain" as const,
            inputs: Object.entries(step.inputs).flatMap(([inputName, id]) => {
              const found = records.get(id);
              if (found === undefined) return [];
              const value = valueOf(found.value);
              return [{ name: inputName, record: id, type: { module: { ...found.type.module }, name: found.type.name },
                ...(value === undefined ? {} : { value: structuredClone(value) }) }];
            }).sort((left, right) => left.name.localeCompare(right.name)),
          };
        }));
      if (consumers.length === 0) return [];
      return [{ record: record.id, id: held.id, subjectId: held.subjectId, projection,
        consumers: consumers.sort((left, right) => left.step.localeCompare(right.step)
          || left.input.localeCompare(right.input)) }];
    })
    .sort((left, right) => left.record.localeCompare(right.record));
}
