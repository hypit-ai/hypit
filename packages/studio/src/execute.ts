import { MemoryResourceStore, NodeDriver } from "@hypit/driver-node";
import type { ResourceStore } from "@hypit/runtime";
import type { BuildState } from "@hypit/protocol";
import type { RuntimeHostTransientExecution } from "@hypit/runtime-host-node";

import type { StudioDomain } from "./domain.js";

export type Executed = {
  readonly state: BuildState;
  readonly status: string;
  readonly unserved: readonly { readonly capability: string; readonly count: number }[];
  readonly errors: readonly string[];
};

/**
 * Run the display closure: deterministic Producers, plus Needs the Runtime explicitly permits in
 * a disposable authoring execution. The Runtime owns Endpoint selection and invocation; Studio
 * never filters Providers or sees their handlers.
 */
export async function executeStudioProjection(
  domain: StudioDomain,
  planned: BuildState,
  resources: ResourceStore,
  execution?: RuntimeHostTransientExecution,
): Promise<Executed> {
  const result = execution === undefined
    ? await new NodeDriver({
        producers: domain.producers,
        validators: domain.validators,
        resources,
      }).run(planned)
    : await execution.evaluate({
        state: planned,
        producers: domain.producers,
        validators: domain.validators,
        resources,
      });
  const counts = new Map<string, number>();
  for (const item of result.blocked) {
    const command = result.state.outstanding.find((candidate) => candidate.id === item.command);
    const capability = command?.kind === "fulfill-need" ? command.need.capability : undefined;
    const name = capability === undefined
      ? item.subject
      : `${capability.module.name}@${capability.module.version}#${capability.name}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    state: result.state,
    status: result.status,
    unserved: [...counts].map(([capability, count]) => ({ capability, count })),
    errors: result.outcomes
      .filter((entry) => entry.status === "error")
      .map((entry) => entry.message ?? "a Producer failed without saying why"),
  };
}

export { MemoryResourceStore };
