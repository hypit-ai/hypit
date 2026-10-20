import type { ResourceStore } from "@hypit/hypit/runtime";
import type { BuildState, Candidate } from "@hypit/hypit/protocol";
import type { BuildCandidateSelection } from "@hypit/hypit/kernel";
import { sameType } from "@hypit/hypit/protocol";
import { temporalTypes } from "@hypit/temporal";
import type { StudioObservedValue } from "@hypit/studio-companion";
import type { CliTransientExecution } from "@hypit/hypit/cli";
import type { StudioDomain } from "./domain.js";
import { executeStudioProjection } from "./execute.js";
import type { RunPlan } from "./run.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import type { ExecutedGraph } from "./temporal-graph.js";

/** Author declarations name logical outputs, not the records selected by a Run. */
export function observedTemporalValues(
  state: ExecutedGraph,
  selections: readonly Pick<BuildCandidateSelection, "output" | "record">[] = [],
): readonly StudioObservedValue[] {
  const records = new Map([...state.program.records, ...state.records].map((record) => [record.id, record]));
  const values = new Map<string, StudioObservedValue>();
  const observe = (id: string, record: typeof state.records[number] | undefined): void => {
    if (record === undefined
      || !(sameType(record.type, temporalTypes.instant) || sameType(record.type, temporalTypes.window))) return;
    values.set(id, { id, type: record.type, value: record.value });
  };
  for (const record of records.values()) observe(record.id, record);
  for (const selection of selections) observe(selection.output, records.get(selection.record));
  return [...values.values()];
}

/** Read-only display requests supplement, but never become prerequisites of, the Film. */
export async function resolveStudioDeclarations(input: {
  readonly run: RunPlan;
  readonly registry: StudioCompanionRegistry;
  readonly domain: StudioDomain;
  readonly resolved: BuildState;
  readonly selections: readonly Pick<BuildCandidateSelection, "output" | "record">[];
  readonly resources: ResourceStore;
  readonly transientExecution?: CliTransientExecution;
}): Promise<{ readonly values: readonly StudioObservedValue[]; readonly issues: readonly string[] }> {
  const values = observedTemporalValues(input.resolved, input.selections);
  const available = new Set(values.map(value => value.id));
  const targets = [...new Set(input.run.source.observations.placements.flatMap(placement =>
    input.registry.projectTemporalDeclarations(placement).map(draft => draft.output)))];
  const missing = targets.filter(output => !available.has(output));
  if (missing.length === 0) return { values, issues: [] };

  // Reuse exact logical outputs from this same compilation through ordinary Run Candidates.
  // No cross-revision cache or inferred correspondence is involved.
  const records = new Map(input.resolved.records.map(record => [record.id, record]));
  const authored = new Set(input.resolved.program.records.map(record => record.id));
  const candidates = new Map<string, Candidate>();
  const satisfactions = new Map(input.run.run.graph.satisfactions.map(item => [item.output, item]));
  for (const selection of input.selections) {
    const record = records.get(selection.record);
    if (record === undefined || authored.has(record.id)) continue;
    const id = `studio:resolved:${record.id}`;
    candidates.set(id, { id, type: record.type, root: { kind: "value", record: `${id}:value`, value: record.value } });
    satisfactions.set(selection.output, { output: selection.output, candidate: id });
  }
  try {
    const prepared = input.run.prepare({
      ...input.run.run,
      graph: {
        ...input.run.run.graph,
        candidates: [...input.run.run.graph.candidates, ...candidates.values()],
        satisfactions: [...satisfactions.values()],
      },
    }, missing);
    const executed = await executeStudioProjection(input.domain, prepared.state, input.resources, input.transientExecution);
    const observed = new Map(values.map(value => [value.id, value]));
    for (const value of observedTemporalValues(executed.state, prepared.selections)) observed.set(value.id, value);
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
