import { MemoryResourceStore, Executor } from "@hypit/hypit/executor";
import { InProcessBuildScheduler } from "@hypit/hypit/runtime";
import type { ResourceStore } from "@hypit/hypit/runtime";
import type { BuildView } from "@hypit/hypit/kernel";
import { capabilityKey } from "@hypit/hypit/protocol";
import type { CliTransientExecution as RuntimeHostTransientExecution } from "@hypit/hypit/cli";

import type { StudioDomain } from "./domain.js";

export type Executed = {
  readonly state: BuildView;
  readonly status: string;
  readonly unserved: readonly { readonly capability: string; readonly count: number }[];
  readonly errors: readonly string[];
};

/**
 * Evaluate the display closure: deterministic Producers, plus Needs the Runtime explicitly permits in
 * a disposable authoring execution. The Runtime owns Endpoint selection and invocation; Studio
 * never filters Providers or sees their handlers.
 */
export async function executeStudioProjection(
  domain: StudioDomain,
  state: BuildView,
  resources: ResourceStore,
  execution?: RuntimeHostTransientExecution,
): Promise<Executed> {
  const result = execution === undefined
    ? (await new InProcessBuildScheduler(new Executor({
        producers: domain.producers,
        refinements: domain.refinements,
        resources,
      })).run([{
        id: "studio-projection",
        definition: { format: "hypit.build-definition@1", program: state.program, plan: state.plan },
        facts: [],
      }]))[0]!
    : await execution.evaluate({
        state,
        producers: domain.producers,
        refinements: domain.refinements,
        resources,
      });
  const counts = new Map<string, number>();
  for (const item of result.blocked) {
    const command = result.state.outstanding.find((candidate) => candidate.id === item.command);
    const capability = command?.kind === "fulfill-need" ? command.need.capability : undefined;
    const name = capability === undefined
      ? item.subject
      : capabilityKey(capability);
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
