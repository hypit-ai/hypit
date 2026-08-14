/**
 * Run a planned build with whatever this machine can actually serve.
 *
 * A preview is a Host like any other: it registers the Providers it has and
 * says plainly which Capabilities it cannot answer. Nothing here knows what a
 * Capability means - the Providers declare what they fulfil, and a Need nobody
 * can fulfil is reported rather than faked.
 */
import { EndpointRegistry, MemoryArtifactStore, NodeDriver } from "@narratage/driver-node";
import type { EndpointPackage } from "@narratage/endpoint-kit";
import type { ArtifactStore } from "@narratage/runtime";
import type { BuildState } from "@narratage/protocol";
import { createLocalHyperframesProvider } from "@narratage/provider-hyperframes-local";
import { createLocalMediaProvider } from "@narratage/provider-media-local";
import { createLocalWhisperXProvider } from "@narratage/provider-whisperx-local";

import { officialVideoDomain } from "../official-video.js";

/** A Capability no Provider on this machine could answer. */
export type Unserved = { readonly capability: string; readonly count: number };

export type Executed = {
  readonly state: BuildState;
  readonly status: string;
  readonly unserved: readonly Unserved[];
  /** Producers that threw, with what they said. */
  readonly errors: readonly string[];
  readonly outcomes: readonly { readonly status: string; readonly message?: string }[];
};

/**
 * The Providers a developer's own machine can run. They are the same ones a
 * local build uses, so a picture the preview draws is a picture that renders.
 */
function localProviders(): readonly EndpointPackage[] {
  const built: EndpointPackage[] = [];
  for (const create of [
    () => createLocalMediaProvider({ instance: "media.local", authority: "media.local" }),
    () => createLocalHyperframesProvider({ instance: "hyperframes.local", authority: "hyperframes.local" }),
    () => createLocalWhisperXProvider({ instance: "whisperx.local", authority: "whisperx.local" }),
  ]) {
    // A Provider whose tool is not installed is simply one the preview does
    // not have, which is the same as any other unserved Capability.
    try { built.push(create()); } catch { continue; }
  }
  return built;
}

async function endpoints(): Promise<EndpointRegistry> {
  const registry = new EndpointRegistry();
  // Each Provider installs the Capabilities it declares. The preview names
  // none of them, so a Provider that grows a Capability grows the preview too.
  for (const provider of localProviders()) {
    await provider.install(registry);
  }
  return registry;
}

export async function execute(planned: BuildState, artifacts: ArtifactStore): Promise<Executed> {
  const domain = await officialVideoDomain();
  const result = await new NodeDriver({
    producers: domain.producers,
    validators: domain.validators,
    endpoints: await endpoints(),
    artifacts,
  }).run(planned);

  // A Need that was answered stays on the state, so what is unserved is what
  // the driver could not move past.
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
    outcomes: result.outcomes as never,
    errors: result.outcomes
      .filter((entry: { status: string }) => entry.status === "error")
      .map((entry: { message?: string }) => entry.message ?? "a Producer failed without saying why"),
  };
}

export { MemoryArtifactStore };
