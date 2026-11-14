import type { AudiovisualProgram } from "@hypit/audiovisual";
import type { TemporalRange } from "@hypit/temporal";

import { planAudiovisualDemand } from "./demand.js";
import { executeAudiovisualIslands } from "./execute.js";
import { bindAudiovisualExecutionProducts } from "./handoff.js";
import { createAudiovisualPictureDemand, type AudiovisualPictureOutput } from "./output.js";
import { partitionAudiovisualExecution } from "./partition.js";
import type {
  AudiovisualDemandPlan,
  AudiovisualExecutionPlan,
  AudiovisualPictureDemand,
  AudiovisualTerminalBinding,
  AudiovisualOutputTerminalBinding,
  BoundAudiovisualExecutionPlan,
  DerivedRenderProductBinding,
} from "./types.js";
import {
  verifyAudiovisualProductBindings,
  verifyAudiovisualTerminalBindings,
  type AudiovisualTerminalCapability,
  type AudiovisualTerminalRuntime,
} from "./capability.js";

/** AVIR and Output have closed into exact demand; no Terminal has been selected. */
export type AudiovisualPictureExecutionPreparation = {
  readonly program: AudiovisualProgram;
  readonly output: AudiovisualPictureOutput;
  readonly demand: AudiovisualPictureDemand;
  readonly demandPlan: AudiovisualDemandPlan;
};

/** Every demanded node has a Terminal; cross-Terminal representations remain unbound. */
export type PartitionedAudiovisualPictureExecution = {
  readonly program: AudiovisualProgram;
  readonly output: AudiovisualPictureOutput;
  readonly demand: AudiovisualPictureDemand;
  readonly execution: AudiovisualExecutionPlan;
  readonly capabilities: readonly AudiovisualTerminalCapability[];
};

/** Terminal and Derived Product bindings are both complete and executable. */
export type AudiovisualPictureExecutionPlan = {
  readonly output: AudiovisualPictureOutput;
  readonly demand: AudiovisualPictureDemand;
  readonly execution: BoundAudiovisualExecutionPlan;
  readonly capabilities: readonly AudiovisualTerminalCapability[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Project renderer-neutral AVIR into one exact Picture demand before any Runtime binding. */
export function prepareAudiovisualPictureExecution(
  program: AudiovisualProgram,
  output: AudiovisualPictureOutput,
  range?: TemporalRange,
): AudiovisualPictureExecutionPreparation {
  const demand = createAudiovisualPictureDemand(program, output, range);
  const demandPlan = planAudiovisualDemand(program, { picture: demand });
  return {
    program: structuredClone(program),
    output: structuredClone(output),
    demand: structuredClone(demand),
    demandPlan,
  };
}

/** Apply the Host's complete finite Node→Terminal binding and expose the resulting island edges. */
export function partitionAudiovisualPictureExecution(
  prepared: AudiovisualPictureExecutionPreparation,
  bindings: readonly AudiovisualTerminalBinding[],
  capabilities: readonly AudiovisualTerminalCapability[],
  outputBindings: readonly AudiovisualOutputTerminalBinding[] = [],
): PartitionedAudiovisualPictureExecution {
  verifyAudiovisualTerminalBindings(
    prepared.program,
    prepared.demandPlan,
    bindings,
    capabilities,
    outputBindings,
  );
  return {
    program: structuredClone(prepared.program),
    output: structuredClone(prepared.output),
    demand: structuredClone(prepared.demand),
    execution: partitionAudiovisualExecution(prepared.demandPlan, bindings, outputBindings),
    capabilities: [...capabilities],
  };
}

/** Bind one agreed representation to every cross-Terminal edge after partitioning. */
export function bindAudiovisualPictureExecution(
  partitioned: PartitionedAudiovisualPictureExecution,
  bindings: readonly DerivedRenderProductBinding[],
): AudiovisualPictureExecutionPlan {
  verifyAudiovisualProductBindings(
    partitioned.program,
    partitioned.execution,
    bindings,
    partitioned.capabilities,
  );
  return {
    output: structuredClone(partitioned.output),
    demand: structuredClone(partitioned.demand),
    execution: bindAudiovisualExecutionProducts(partitioned.execution, bindings),
    capabilities: [...partitioned.capabilities],
  };
}

/** Execute one fully bound Picture plan and return its root Terminal-owned value. */
export async function executeAudiovisualPicture<ProductValue, OutputValue>(
  plan: AudiovisualPictureExecutionPlan,
  runtimes: readonly AudiovisualTerminalRuntime<ProductValue, OutputValue>[],
): Promise<OutputValue> {
  const planned = new Map(plan.capabilities.map((capability) => [capability.terminal, capability]));
  const supplied = new Set<string>();
  for (const runtime of runtimes) {
    assert(runtime.capability.terminal === runtime.executor.terminal,
      `Audiovisual Terminal capability ${runtime.capability.terminal} is paired with executor ${runtime.executor.terminal}.`);
    assert(planned.get(runtime.capability.terminal) === runtime.capability,
      `Audiovisual Terminal runtime ${runtime.executor.terminal} does not realize its bound capability.`);
    assert(!supplied.has(runtime.capability.terminal),
      `Audiovisual Terminal runtime ${runtime.executor.terminal} was supplied more than once.`);
    supplied.add(runtime.capability.terminal);
  }
  for (const terminal of new Set(plan.execution.islands.map((island) => island.terminal))) {
    assert(supplied.has(terminal), `Bound Audiovisual Terminal ${terminal} has no Runtime.`);
  }
  const result = await executeAudiovisualIslands<ProductValue, OutputValue>(
    plan.execution,
    runtimes.map((runtime) => runtime.executor),
  );
  assert(result.outputs.picture !== undefined,
    "Audiovisual Picture execution did not produce a final Picture output.");
  return result.outputs.picture;
}
