import type { AudiovisualProgram } from "@hypit/audiovisual";

import type {
  AudiovisualDemandPlan,
  AudiovisualExecutionPlan,
  AudiovisualTerminalBinding,
  AudiovisualOutputTerminalBinding,
  AudiovisualTerminalExecutor,
  DerivedRenderProductBinding,
  DerivedRenderProductRequirement,
  ExecutionNodeDemand,
  SourceExecutionTaskDemand,
  AudiovisualSignal,
} from "./types.js";

export type AudiovisualTerminalBindingTarget =
  | { readonly kind: "node"; readonly demand: ExecutionNodeDemand }
  | { readonly kind: "source"; readonly demand: SourceExecutionTaskDemand };

export type AudiovisualTerminalBindingContext = {
  readonly program: AudiovisualProgram;
  readonly demand: AudiovisualDemandPlan;
  readonly binding: AudiovisualTerminalBinding;
  readonly target: AudiovisualTerminalBindingTarget;
};

export type AudiovisualTerminalProductContext = {
  readonly program: AudiovisualProgram;
  readonly plan: AudiovisualExecutionPlan;
  readonly requirement: DerivedRenderProductRequirement;
};

/** Package-owned execution capability offered to one finite Host invocation. */
export type AudiovisualTerminalCapability = {
  readonly terminal: string;
  /** Final Programme signals this implementation can close for the caller. */
  readonly finalOutputs: readonly AudiovisualSignal[];
  /** Throw an implementation-specific error when this explicit binding is unsupported. */
  readonly verifyBinding: (context: AudiovisualTerminalBindingContext) => void;
  /** Representation identities this Terminal can consume on this exact edge. */
  readonly inputRepresentations: (context: AudiovisualTerminalProductContext) => readonly string[];
  /** Representation identities this Terminal can publish on this exact edge. */
  readonly outputRepresentations: (context: AudiovisualTerminalProductContext) => readonly string[];
};

/** One package offer paired with the exact executor that realizes it. */
export type AudiovisualTerminalRuntime<ProductValue = unknown, OutputValue = unknown> = {
  readonly capability: AudiovisualTerminalCapability;
  readonly executor: AudiovisualTerminalExecutor<ProductValue, OutputValue>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function capabilityMap(
  capabilities: readonly AudiovisualTerminalCapability[],
): ReadonlyMap<string, AudiovisualTerminalCapability> {
  const result = new Map<string, AudiovisualTerminalCapability>();
  for (const capability of capabilities) {
    assert(capability.terminal.length > 0, "Audiovisual Terminal capability identity is empty.");
    assert(!result.has(capability.terminal),
      `Audiovisual Terminal ${capability.terminal} has more than one capability offer.`);
    const outputs = new Set<AudiovisualSignal>();
    for (const signal of capability.finalOutputs) {
      assert(signal === "picture" || signal === "audio",
        `Audiovisual Terminal ${capability.terminal} offered unknown final output ${signal}.`);
      assert(!outputs.has(signal),
        `Audiovisual Terminal ${capability.terminal} repeated final output ${signal}.`);
      outputs.add(signal);
    }
    result.set(capability.terminal, capability);
  }
  return result;
}

function representations(values: readonly string[], terminal: string, direction: string): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    assert(value.length > 0, `Audiovisual Terminal ${terminal} offered an empty ${direction} representation.`);
    assert(!result.has(value),
      `Audiovisual Terminal ${terminal} repeated ${direction} representation ${value}.`);
    result.add(value);
  }
  return result;
}

/** Verify explicit Host choices against finite package offers without selecting or falling back. */
export function verifyAudiovisualTerminalBindings(
  program: AudiovisualProgram,
  demand: AudiovisualDemandPlan,
  bindings: readonly AudiovisualTerminalBinding[],
  capabilities: readonly AudiovisualTerminalCapability[],
  outputBindings: readonly AudiovisualOutputTerminalBinding[] = [],
): void {
  const offers = capabilityMap(capabilities);
  const nodes = new Map(demand.nodes.map((node) => [node.id, node]));
  const sources = new Map(demand.sourceTasks.map((source) => [source.id, source]));
  for (const binding of bindings) {
    const capability = offers.get(binding.terminal);
    assert(capability !== undefined,
      `Audiovisual Terminal ${binding.terminal} has no capability offer in this invocation.`);
    const node = nodes.get(binding.node);
    const source = sources.get(binding.node);
    assert((node === undefined) !== (source === undefined),
      `Terminal binding references unknown or ambiguous demand ${binding.node}.`);
    capability.verifyBinding({
      program,
      demand,
      binding,
      target: node === undefined
        ? { kind: "source", demand: source! }
        : { kind: "node", demand: node },
    });
  }
  const selected = new Map(bindings.map((binding) => [binding.node, binding]));
  const selectedOutputs = new Map<AudiovisualSignal, AudiovisualOutputTerminalBinding>();
  for (const binding of outputBindings) {
    assert(demand.outputs[binding.signal] !== undefined,
      `Final Terminal binding selects absent ${binding.signal} output.`);
    assert(!selectedOutputs.has(binding.signal),
      `Final ${binding.signal} output is bound more than once.`);
    const capability = offers.get(binding.terminal);
    assert(capability !== undefined,
      `Final Audiovisual Terminal ${binding.terminal} has no capability offer in this invocation.`);
    assert(capability.finalOutputs.includes(binding.signal),
      `Audiovisual Terminal ${binding.terminal} cannot close final ${binding.signal} output.`);
    selectedOutputs.set(binding.signal, binding);
  }
  for (const [signal, node] of Object.entries(demand.outputs) as [AudiovisualSignal, string][]) {
    if (selectedOutputs.has(signal)) continue;
    const binding = selected.get(node);
    assert(binding !== undefined, `Final ${signal} demand ${node} has no Terminal binding.`);
    const capability = offers.get(binding.terminal)!;
    assert(capability.finalOutputs.includes(signal),
      `Audiovisual Terminal ${binding.terminal} cannot close final ${signal} output.`);
  }
}

/** Verify an explicit edge representation against both already-bound Terminals. */
export function verifyAudiovisualProductBindings(
  program: AudiovisualProgram,
  plan: AudiovisualExecutionPlan,
  bindings: readonly DerivedRenderProductBinding[],
  capabilities: readonly AudiovisualTerminalCapability[],
): void {
  const offers = capabilityMap(capabilities);
  const islands = new Map(plan.islands.map((island) => [island.id, island]));
  const requirements = new Map(plan.products.map((product) => [product.id, product]));
  for (const binding of bindings) {
    const requirement = requirements.get(binding.product);
    assert(requirement !== undefined,
      `Product capability verification references unknown Product ${binding.product}.`);
    const producer = islands.get(requirement.producer)!;
    const consumer = islands.get(requirement.consumer)!;
    const producerCapability = offers.get(producer.terminal);
    const consumerCapability = offers.get(consumer.terminal);
    assert(producerCapability !== undefined && consumerCapability !== undefined,
      `Product ${binding.product} references a Terminal without a capability offer.`);
    const context = { program, plan, requirement };
    const outputs = representations(
      producerCapability.outputRepresentations(context),
      producer.terminal,
      "output",
    );
    const inputs = representations(
      consumerCapability.inputRepresentations(context),
      consumer.terminal,
      "input",
    );
    assert(outputs.has(binding.representation),
      `Audiovisual Terminal ${producer.terminal} cannot publish ${binding.representation} for Product ${binding.product}.`);
    assert(inputs.has(binding.representation),
      `Audiovisual Terminal ${consumer.terminal} cannot consume ${binding.representation} for Product ${binding.product}.`);
  }
}
