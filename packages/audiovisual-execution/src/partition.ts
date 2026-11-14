import type {
  AudiovisualDemandPlan,
  AudiovisualExecutionPlan,
  AudiovisualTerminalBinding,
  AudiovisualOutputTerminalBinding,
  DerivedRenderProductRequirement,
  ExecutionIsland,
} from "./types.js";
import { planSourceExecution } from "./access.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(typeof value === "string" && value.length > 0, `${label} is empty.`);
}

/**
 * Partition a demand plan under explicit, already-selected terminal bindings.
 * Selection and fallback policy deliberately remain outside this pure step.
 */
export function partitionAudiovisualExecution(
  demand: AudiovisualDemandPlan,
  bindings: readonly AudiovisualTerminalBinding[],
  outputBindings: readonly AudiovisualOutputTerminalBinding[] = [],
): AudiovisualExecutionPlan {
  const tasks = [
    ...demand.nodes.map((node) => ({
      id: node.id,
      signal: node.signal,
      operation: node.operation,
      dependencies: node.dependencies,
      sourceGroup: undefined,
      target: "node" as const,
      temporal: { kind: "signal" as const, regions: node.temporal },
      ...(node.pictureDomain === undefined ? {} : { pictureDomain: node.pictureDomain }),
      ...(node.spatial === undefined ? {} : { spatial: node.spatial }),
    })),
    ...demand.sourceTasks.map((source) => ({
      id: source.id,
      signal: source.signal,
      operation: "source",
      dependencies: [] as readonly string[],
      sourceGroup: `${source.program}\u0000${source.source}`,
      target: "source" as const,
      temporal: source.temporal,
      ...(source.pictureDomain === undefined ? {} : { pictureDomain: source.pictureDomain }),
      ...(source.spatial === undefined ? {} : { spatial: source.spatial }),
    })),
  ];
  const nodes = new Map(tasks.map((node) => [node.id, node]));
  const uses = new Map(demand.uses.map((use) => [use.id, use]));
  for (const use of demand.uses) {
    const node = nodes.get(use.node);
    assert(node?.operation === "use", `Source use ${use.id} does not reference a Programme use node.`);
    const producer = nodes.get(use.producer);
    assert(producer !== undefined, `Source use ${use.id} does not reference a demanded producer.`);
    assert(producer.signal === use.signal,
      `Source use ${use.id} producer has the wrong signal.`);
    if (producer.operation === "source") {
      const source = demand.sourceTasks.find((candidate) => candidate.id === producer.id)!;
      assert(source.source === use.source && source.output === use.output,
        `Source use ${use.id} does not match producer ${producer.id}.`);
    }
    assert(node.dependencies.includes(use.producer),
      `Programme use node ${use.node} does not depend on producer ${use.producer}.`);
  }
  for (const task of demand.sourceTasks) for (const use of task.uses) {
    assert(uses.get(use)?.producer === task.id,
      `Source execution task ${task.id} references unrelated use ${use}.`);
  }
  const assigned = new Map<string, AudiovisualTerminalBinding>();
  for (const binding of bindings) {
    identity(binding.terminal, "Execution terminal");
    assert(nodes.has(binding.node), `Terminal binding references undemanded node ${binding.node}.`);
    assert(!assigned.has(binding.node), `Execution node ${binding.node} is bound more than once.`);
    assigned.set(binding.node, structuredClone(binding));
  }
  for (const node of tasks) {
    assert(assigned.has(node.id), `Demanded execution node ${node.id} has no Terminal binding.`);
    const binding = assigned.get(node.id)!;
    if (node.operation === "source") {
      assert(binding.sourceAccess !== undefined,
        `Source execution node ${node.id} has no temporal access declaration.`);
      const source = demand.sourceTasks.find((candidate) => candidate.id === node.id)!;
      assert((source.temporal.kind === "constant") === (binding.sourceAccess.kind === "constant"),
        `Source execution node ${node.id} temporal access does not match its output.`);
    } else {
      assert(binding.sourceAccess === undefined,
        `Non-Source execution node ${node.id} declares Source temporal access.`);
    }
  }

  const parent = new Map(tasks.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const join = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const node of tasks) for (const dependency of node.dependencies) {
    const left = assigned.get(node.id)!;
    const right = assigned.get(dependency)!;
    if (left.terminal === right.terminal && nodes.get(dependency)!.signal === node.signal) {
      join(node.id, dependency);
    }
  }
  const coordinatedSources = new Map<string, string[]>();
  for (const node of tasks) if (node.sourceGroup !== undefined) {
    const terminal = assigned.get(node.id)!.terminal;
    const key = `${terminal}\u0000${node.sourceGroup}`;
    coordinatedSources.set(key, [...(coordinatedSources.get(key) ?? []), node.id]);
  }
  for (const group of coordinatedSources.values()) {
    const first = group[0]!;
    for (const node of group.slice(1)) join(first, node);
  }

  const groups = new Map<string, string[]>();
  for (const node of tasks) {
    const root = find(node.id);
    groups.set(root, [...(groups.get(root) ?? []), node.id]);
  }
  const orderedGroups = [...groups.values()].sort((left, right) => left[0]!.localeCompare(right[0]!));
  const islandOf = new Map<string, string>();
  const islands: ExecutionIsland[] = orderedGroups.map((group, index) => {
    const first = nodes.get(group[0]!)!;
    const terminal = assigned.get(first.id)!.terminal;
    const signals = [...new Set(group.map((node) => nodes.get(node)!.signal))].sort();
    const id = `${demand.program}:island-${index + 1}`;
    for (const node of group) islandOf.set(node, id);
    return { id, signals, terminal, nodes: [...group].sort(), dependencies: [] };
  });

  const products = new Map<string, DerivedRenderProductRequirement>();
  const islandDependencies = new Map(islands.map((island) => [island.id, new Set<string>()]));
  for (const consumer of tasks) for (const dependency of consumer.dependencies) {
    const producerIsland = islandOf.get(dependency)!;
    const consumerIsland = islandOf.get(consumer.id)!;
    if (producerIsland === consumerIsland) continue;
    islandDependencies.get(consumerIsland)!.add(producerIsland);
    const source = nodes.get(dependency)!;
    const productId = `${producerIsland}->${consumerIsland}:${dependency}`;
    products.set(productId, {
      id: productId,
      signal: source.signal,
      target: source.target,
      producer: producerIsland,
      consumer: consumerIsland,
      node: dependency,
      temporal: structuredClone(source.temporal),
      ...(source.pictureDomain === undefined ? {} : {
        pictureDomain: structuredClone(source.pictureDomain),
      }),
      ...(source.spatial === undefined ? {} : { spatial: structuredClone(source.spatial) }),
    });
  }
  const completedIslands: ExecutionIsland[] = islands.map((island) => ({
    ...island,
    dependencies: [...islandDependencies.get(island.id)!].sort(),
  }));
  const selectedOutputs = new Map(outputBindings.map((binding) => [binding.signal, binding]));
  const outputs: Partial<Record<import("./types.js").AudiovisualSignal, string>> = {};
  for (const [signal, node] of Object.entries(demand.outputs) as [import("./types.js").AudiovisualSignal, string][]) {
    const producerIsland = islandOf.get(node)!;
    const selected = selectedOutputs.get(signal);
    if (selected === undefined
      || completedIslands.find((island) => island.id === producerIsland)!.terminal === selected.terminal) {
      outputs[signal] = producerIsland;
      continue;
    }
    const sink = `${demand.program}:output-${signal}`;
    assert(!completedIslands.some((island) => island.id === sink),
      `Final ${signal} output sink identity collides with an execution island.`);
    completedIslands.push({
      id: sink,
      signals: [signal],
      terminal: selected.terminal,
      nodes: [],
      dependencies: [producerIsland],
    });
    const source = nodes.get(node)!;
    const productId = `${producerIsland}->${sink}:${node}`;
    products.set(productId, {
      id: productId,
      signal,
      target: source.target,
      producer: producerIsland,
      consumer: sink,
      node,
      temporal: structuredClone(source.temporal),
      ...(source.pictureDomain === undefined ? {} : {
        pictureDomain: structuredClone(source.pictureDomain),
      }),
      ...(source.spatial === undefined ? {} : { spatial: structuredClone(source.spatial) }),
    });
    outputs[signal] = sink;
  }
  const sourceExecutions = demand.sourceTasks.map((task) =>
    planSourceExecution(task, assigned.get(task.id)!));
  return {
    program: demand.program,
    demand: structuredClone(demand),
    terminalBindings: bindings.map((binding) => structuredClone(binding)),
    outputTerminalBindings: outputBindings.map((binding) => structuredClone(binding)),
    sourceExecutions,
    islands: completedIslands,
    products: [...products.values()],
    outputs,
  };
}
