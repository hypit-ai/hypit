import { EndpointRegistry, MemoryResourceStore, NodeDriver } from "@hypit/driver-node";
import type { ResourceStore } from "@hypit/runtime";
import type { BuildState } from "@hypit/protocol";

import type { StudioDomain } from "./domain.js";

export type Executed = {
  readonly state: BuildState;
  readonly status: string;
  readonly unserved: readonly { readonly capability: string; readonly count: number }[];
  readonly errors: readonly string[];
};

/**
 * Run the display closure: deterministic Producers, plus Needs served by the Profile's local
 * Endpoints when the caller hands them in. Nothing priced is ever installed here; a Need that
 * reaches no installed Endpoint is reported as unserved, never guessed at.
 */
export async function executeDeterministic(
  domain: StudioDomain,
  planned: BuildState,
  resources: ResourceStore,
  endpoints: EndpointRegistry = new EndpointRegistry(),
): Promise<Executed> {
  const result = await new NodeDriver({
    producers: domain.producers,
    validators: domain.validators,
    endpoints,
    resources,
  }).run(planned);
  const counts = new Map<string, number>();
  for (const item of result.blocked) {
    const need = result.state.needs.find((candidate) => item.subject.includes(candidate.capability.name));
    const name = need?.capability.name ?? item.subject;
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
