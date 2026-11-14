import { assertAudiovisualProgram, type AudiovisualProgram } from "@hypit/audiovisual";
import { compareTemporalMapPoints, unionTemporalMapRegionSets } from "@hypit/temporal/algebra";

import { planAudiovisualRegionDemand, type AudiovisualRegionDemand } from "./demand.js";
import type {
  AudiovisualDemandPlan,
  ExecutionNodeDemand,
  SourceExecutionTaskDemand,
  SourceUseDemand,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Explicit implementation of one ProgramSource identity by a closed child Programme. */
export type NestedProgramBinding = {
  /** Programme whose Source occurrence receives this implementation. */
  readonly program: string;
  readonly source: string;
  readonly implementation: AudiovisualProgram;
};

function unionSpatial(
  left: import("@hypit/spatial/algebra").SpatialRegion | undefined,
  right: import("@hypit/spatial/algebra").SpatialRegion | undefined,
) {
  if (left === undefined) return right === undefined ? undefined : structuredClone(right);
  if (right === undefined) return structuredClone(left);
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const endX = Math.max(left.x + left.width, right.x + right.width);
  const endY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: endX - x, height: endY - y };
}

function unionSamples(
  left: SourceExecutionTaskDemand["samples"],
  right: SourceExecutionTaskDemand["samples"],
) {
  if (left === undefined && right === undefined) return undefined;
  const values = [...(left ?? []), ...(right ?? [])].sort(compareTemporalMapPoints);
  return values.filter((value, index) => index === 0
    || compareTemporalMapPoints(values[index - 1]!, value) !== 0);
}

function mergeSourceTasks(
  values: readonly SourceExecutionTaskDemand[],
): SourceExecutionTaskDemand[] {
  const merged = new Map<string, SourceExecutionTaskDemand>();
  for (const value of values) {
    const current = merged.get(value.id);
    if (current === undefined) {
      merged.set(value.id, structuredClone(value));
      continue;
    }
    assert(current.program === value.program && current.signal === value.signal && current.source === value.source
      && current.output === value.output,
    `Source execution task identity ${value.id} refers to incompatible Sources.`);
    assert(current.temporal.kind === value.temporal.kind,
      `Source execution task ${value.id} has incompatible temporal kinds.`);
    const temporal = current.temporal.kind === "signal" && value.temporal.kind === "signal"
      ? { kind: "signal" as const, regions: unionTemporalMapRegionSets(
        current.temporal.regions, value.temporal.regions,
      ) }
      : { kind: "constant" as const };
    const spatial = unionSpatial(current.spatial, value.spatial);
    const samples = unionSamples(current.samples, value.samples);
    merged.set(value.id, {
      ...current,
      uses: [...new Set([...current.uses, ...value.uses])].sort(),
      temporal,
      ...(spatial === undefined ? {} : { spatial }),
      ...(samples === undefined ? {} : { samples }),
    });
  }
  return [...merged.values()];
}

function namespacePlan(value: AudiovisualDemandPlan, prefix: string): AudiovisualDemandPlan {
  const graphNodes = new Set(value.nodes.map((node) => node.id));
  const sourceTasks = new Set(value.sourceTasks.map((task) => task.id));
  const graphId = (id: string): string => `${prefix}/${id}`;
  const executionId = (id: string): string => graphNodes.has(id) || sourceTasks.has(id) ? graphId(id) : id;
  const nodes: ExecutionNodeDemand[] = value.nodes.map((node) => ({
    ...structuredClone(node),
    id: graphId(node.id),
    dependencies: node.dependencies.map(executionId),
  }));
  const uses: SourceUseDemand[] = value.uses.map((use) => ({
    ...structuredClone(use),
    id: graphId(use.id),
    node: graphId(use.node),
    producer: executionId(use.producer),
  }));
  const tasks = value.sourceTasks.map((task) => ({
    ...structuredClone(task),
    id: graphId(task.id),
    uses: task.uses.map(graphId),
  }));
  return {
    program: value.program,
    nodes,
    uses,
    sourceTasks: tasks,
    outputs: Object.fromEntries(Object.entries(value.outputs).map(([signal, node]) => [
      signal, graphId(node),
    ])),
  };
}

function nestedDemand(
  tasks: readonly SourceExecutionTaskDemand[],
): AudiovisualRegionDemand {
  const picture = tasks.find((task) => task.signal === "picture");
  const audio = tasks.find((task) => task.signal === "audio");
  for (const task of tasks) {
    assert(task.temporal.kind === "signal",
      `Nested Programme Source ${task.source}.${task.output} cannot be constant.`);
  }
  const temporal = (task: SourceExecutionTaskDemand) => {
    assert(task.temporal.kind === "signal",
      `Nested Programme Source ${task.source}.${task.output} cannot be constant.`);
    return task.temporal.regions;
  };
  return {
    ...(picture === undefined ? {} : { picture: {
      temporal: temporal(picture),
      ...(picture.spatial === undefined ? {} : { region: picture.spatial }),
      ...(picture.samples === undefined ? {} : { samples: picture.samples }),
    } }),
    ...(audio === undefined ? {} : { audio: {
      temporal: temporal(audio),
    } }),
  };
}

function expand(
  value: AudiovisualDemandPlan,
  bindings: ReadonlyMap<string, NestedProgramBinding>,
  ancestors: ReadonlySet<string>,
): AudiovisualDemandPlan {
  let nodes = value.nodes.map((node) => structuredClone(node));
  let uses = value.uses.map((use) => structuredClone(use));
  let sourceTasks = value.sourceTasks.map((task) => structuredClone(task));

  const groups = new Map<string, SourceExecutionTaskDemand[]>();
  for (const task of sourceTasks) {
    const key = `${task.program}\u0000${task.source}`;
    if (bindings.has(key)) groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  for (const [bindingKey, tasks] of groups) {
    const binding = bindings.get(bindingKey)!;
    const source = tasks[0]!.source;
    assertAudiovisualProgram(binding.implementation);
    assert(!ancestors.has(binding.implementation.id),
      `Nested Audiovisual Programme cycle reaches ${binding.implementation.id}.`);
    const child = expand(
      planAudiovisualRegionDemand(binding.implementation, nestedDemand(tasks)),
      bindings,
      new Set([...ancestors, binding.implementation.id]),
    );
    const prefix = `nested:${value.program.length}:${value.program}:${source.length}:${source}`;
    const nested = namespacePlan(child, prefix);
    const nestedNodeIds = new Set(nested.nodes.map((node) => node.id));
    for (const node of nodes) assert(!nestedNodeIds.has(node.id),
      `Nested execution node identity collides at ${node.id}.`);

    for (const task of tasks) {
      const output = nested.outputs[task.signal];
      assert(output !== undefined,
        `Nested Programme ${binding.implementation.id} has no demanded ${task.signal} output.`);
      const directUses = new Set(task.uses);
      uses = uses.map((use) => directUses.has(use.id)
        ? { ...use, producer: output }
        : use);
      nodes = nodes.map((node) => directUses.has(node.id) ? {
        ...node,
        dependencies: node.dependencies.map((dependency) =>
          dependency === task.id ? output : dependency),
      } : node);
    }
    const removed = new Set(tasks.map((task) => task.id));
    sourceTasks = sourceTasks.filter((task) => !removed.has(task.id));
    nodes.push(...nested.nodes);
    uses.push(...nested.uses);
    sourceTasks.push(...nested.sourceTasks);
  }
  return {
    program: value.program,
    nodes,
    uses,
    sourceTasks: mergeSourceTasks(sourceTasks),
    outputs: structuredClone(value.outputs),
  };
}

/**
 * Recursively replace explicitly bound Programme Sources with their demanded
 * child graphs. Unbound Sources remain terminal-owned leaf tasks.
 */
export function expandNestedAudiovisualPrograms(
  value: AudiovisualDemandPlan,
  bindings: readonly NestedProgramBinding[],
): AudiovisualDemandPlan {
  const bySource = new Map<string, NestedProgramBinding>();
  for (const binding of bindings) {
    assert(typeof binding.program === "string" && binding.program.length > 0,
      "Nested Programme binding owner is empty.");
    assert(typeof binding.source === "string" && binding.source.length > 0,
      "Nested Programme binding Source is empty.");
    const key = `${binding.program}\u0000${binding.source}`;
    assert(!bySource.has(key),
      `Nested Programme Source ${binding.program}.${binding.source} is bound more than once.`);
    assertAudiovisualProgram(binding.implementation);
    bySource.set(key, binding);
  }
  return expand(value, bySource, new Set([value.program]));
}
