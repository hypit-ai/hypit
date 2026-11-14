import type {
  AudiovisualExecutionResult,
  AudiovisualSignal,
  AudiovisualTerminalExecutor,
  BoundAudiovisualExecutionPlan,
  DerivedRenderProduct,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Execute already-planned islands and pass transient representations across
 * their bound product edges. Scheduling is intentionally local and sequential;
 * cancellation, persistence, retries and remote work remain Host concerns.
 */
export async function executeAudiovisualIslands<ProductValue = unknown, OutputValue = unknown>(
  plan: BoundAudiovisualExecutionPlan,
  executors: readonly AudiovisualTerminalExecutor<ProductValue, OutputValue>[],
): Promise<AudiovisualExecutionResult<ProductValue, OutputValue>> {
  const byTerminal = new Map<string, AudiovisualTerminalExecutor<ProductValue, OutputValue>>();
  for (const executor of executors) {
    assert(!byTerminal.has(executor.terminal),
      `Audiovisual Terminal ${executor.terminal} has more than one executor.`);
    byTerminal.set(executor.terminal, executor);
  }
  const requirements = new Map(plan.products.map((product) => [product.id, product]));
  const bindings = new Map(plan.productBindings.map((binding) => [binding.product, binding]));
  assert(bindings.size === plan.products.length,
    "Bound audiovisual execution plan has incomplete product bindings.");
  const produced = new Map<string, DerivedRenderProduct<ProductValue>>();
  const completed = new Set<string>();
  const outputs: Partial<Record<AudiovisualSignal, OutputValue>> = {};
  const pending = new Map(plan.islands.map((island) => [island.id, island]));

  while (pending.size > 0) {
    const island = [...pending.values()].find((candidate) =>
      candidate.dependencies.every((dependency) => completed.has(dependency)));
    assert(island !== undefined, "Audiovisual execution islands contain a dependency cycle.");
    const executor = byTerminal.get(island.terminal);
    assert(executor !== undefined,
      `Audiovisual Terminal ${island.terminal} has no executor.`);
    const inputRequirements = plan.products.filter((product) => product.consumer === island.id);
    const inputs = inputRequirements.map((product) => {
      const value = produced.get(product.id);
      assert(value !== undefined,
        `Audiovisual island ${island.id} is missing product ${product.id}.`);
      return value;
    });
    const outputRequirements = plan.products.filter((product) => product.producer === island.id)
      .map((requirement) => ({
        requirement,
        binding: bindings.get(requirement.id)!,
      }));
    const finalOutputs = (Object.entries(plan.outputs) as [AudiovisualSignal, string][])
      .filter(([, owner]) => owner === island.id)
      .map(([signal]) => signal);
    const sourceIds = new Set(island.nodes);
    const result = await executor.execute({
      island,
      nodes: plan.demand.nodes.filter((node) => sourceIds.has(node.id)),
      uses: plan.demand.uses.filter((use) => sourceIds.has(use.node)),
      sources: plan.sourceExecutions.filter((source) => sourceIds.has(source.task)),
      inputs,
      products: outputRequirements,
      finalOutputs,
    });
    const returned = new Map<string, ProductValue>();
    for (const product of result.products) {
      assert(outputRequirements.some((output) => output.requirement.id === product.product),
        `Audiovisual Terminal ${island.terminal} returned unexpected product ${product.product}.`);
      assert(!returned.has(product.product),
        `Audiovisual Terminal ${island.terminal} returned product ${product.product} more than once.`);
      returned.set(product.product, product.value);
    }
    for (const output of outputRequirements) {
      assert(returned.has(output.requirement.id),
        `Audiovisual Terminal ${island.terminal} did not return product ${output.requirement.id}.`);
      produced.set(output.requirement.id, {
        requirement: structuredClone(requirements.get(output.requirement.id)!),
        binding: structuredClone(output.binding),
        value: returned.get(output.requirement.id)!,
      });
    }
    for (const signal of finalOutputs) {
      assert(result.outputs !== undefined && signal in result.outputs,
        `Audiovisual Terminal ${island.terminal} did not return final ${signal} output.`);
      outputs[signal] = result.outputs[signal]!;
    }
    for (const signal of Object.keys(result.outputs ?? {}) as AudiovisualSignal[]) {
      assert(finalOutputs.includes(signal),
        `Audiovisual Terminal ${island.terminal} returned unexpected final ${signal} output.`);
    }
    pending.delete(island.id);
    completed.add(island.id);
  }
  return { products: [...produced.values()], outputs };
}
