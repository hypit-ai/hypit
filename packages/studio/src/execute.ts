import { EndpointRegistry, MemoryArtifactStore, NodeDriver } from "@hypit/driver-node";
import type { ArtifactStore } from "@hypit/runtime";
import type { BuildState } from "@hypit/protocol";

import type { StudioDomain } from "./domain.js";

export type Executed = {
  readonly state: BuildState;
  readonly status: string;
  readonly unserved: readonly { readonly capability: string; readonly count: number }[];
  readonly errors: readonly string[];
};

/** Run only deterministic Producers; Studio never installs or invokes Provider endpoints. */
export async function executeDeterministic(
  domain: StudioDomain,
  planned: BuildState,
  artifacts: ArtifactStore,
): Promise<Executed> {
  const result = await new NodeDriver({
    producers: domain.producers,
    validators: domain.validators,
    endpoints: new EndpointRegistry(),
    artifacts,
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

export { MemoryArtifactStore };
