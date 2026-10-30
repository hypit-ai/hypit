import type { ResourceStore } from "@hypit/hypit/runtime";
import type { BuildView, ResolvedOutputRecord } from "@hypit/hypit/kernel";
import { sameType } from "@hypit/hypit/protocol";
import { temporalTypes } from "@hypit/temporal";
import type { StudioObservedValue } from "@hypit/studio-companion";
import type { CliTransientExecution } from "@hypit/hypit/cli";
import type { StudioDomain } from "./domain.js";
import { executeStudioProjection } from "./execute.js";
import type { StudioPlan } from "./build-plan.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import type { ExecutedGraph } from "./temporal-graph.js";

/** Author declarations name logical outputs, not their graph-internal Records. */
export function observedTemporalValues(
  state: ExecutedGraph,
  outputs: readonly ResolvedOutputRecord[] = [],
): readonly StudioObservedValue[] {
  const records = new Map([...state.program.records, ...state.records].map((record) => [record.id, record]));
  const values = new Map<string, StudioObservedValue>();
  const observe = (id: string, record: typeof state.records[number] | undefined): void => {
    if (record === undefined
      || !(sameType(record.type, temporalTypes.instant) || sameType(record.type, temporalTypes.window))) return;
    values.set(id, { id, type: record.type, value: record.value });
  };
  for (const record of records.values()) observe(record.id, record);
  for (const output of outputs) observe(output.output, records.get(output.record));
  return [...values.values()];
}

/** Read-only display requests supplement, but never become prerequisites of, the Film. */
export async function resolveStudioDeclarations(input: {
  readonly plan: StudioPlan;
  readonly registry: StudioCompanionRegistry;
  readonly domain: StudioDomain;
  readonly resolved: BuildView;
  readonly outputs: readonly ResolvedOutputRecord[];
  readonly resources: ResourceStore;
  readonly transientExecution?: CliTransientExecution;
}): Promise<{ readonly values: readonly StudioObservedValue[]; readonly issues: readonly string[] }> {
  const values = observedTemporalValues(input.resolved, input.outputs);
  const available = new Set(values.map(value => value.id));
  const targets = [...new Set(input.plan.source.observations.placements.flatMap(placement =>
    input.registry.projectTemporalDeclarations(placement).map(draft => draft.output)))];
  const missing = targets.filter(output => !available.has(output));
  if (missing.length === 0) return { values, issues: [] };

  try {
    const prepared = input.plan.prepare(missing);
    const executed = await executeStudioProjection(input.domain, prepared.state, input.resources, input.transientExecution);
    const observed = new Map(values.map(value => [value.id, value]));
    for (const value of observedTemporalValues(executed.state, prepared.outputs)) observed.set(value.id, value);
    const unresolved = missing.filter(output => !observed.has(output));
    return {
      values: [...observed.values()],
      issues: unresolved.length === 0 ? [] : [
        `Studio timeline locators are unresolved: ${unresolved.join(", ")}.`,
        ...executed.errors,
        ...executed.unserved.map(item => `Unavailable display capability: ${item.capability}.`),
      ],
    };
  } catch (error) {
    return { values, issues: [`Studio timeline locators could not be evaluated: ${error instanceof Error ? error.message : String(error)}`] };
  }
}
