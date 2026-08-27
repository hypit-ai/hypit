import type { ArtifactAttachment } from "@hypit/workspace";
import type { BlobRef } from "@hypit/protocol";
import { MemoryArtifactStore, EndpointRegistry } from "@hypit/driver-node";
import { createLocalMediaProvider } from "@hypit/provider-media-local";
import { mockMediaCapabilities } from "@hypit/mock-media";
type ArtifactStore = {
  readonly get: (digest: BlobRef["digest"]) => Promise<Uint8Array | undefined>;
  readonly put: (bytes: Uint8Array, mediaType: string) => Promise<BlobRef>;
  readonly has: (digest: BlobRef["digest"]) => Promise<boolean>;
};

/**
 * Execute one mock Need with the local Provider.  Callers may provide the
 * project preview ArtifactStore so the resulting bytes survive the process
 * which created the temporary Run (Studio is deliberately a separate
 * process).  The in-memory default is retained for small library callers.
 */
export async function materializeMockNeed(input: {
  readonly capability: typeof mockMediaCapabilities[keyof typeof mockMediaCapabilities];
  readonly constraints: unknown;
  readonly artifacts?: ArtifactStore;
}): Promise<{ readonly artifact: BlobRef; readonly attachment: ArtifactAttachment }> {
  const artifacts = input.artifacts ?? new MemoryArtifactStore();
  const registry = new EndpointRegistry();
  await createLocalMediaProvider({}).install(registry);
  const registration = registry.resolve({ id: "mock", capability: input.capability, returns: { module: { name: "@hypit/artifact", version: "1" }, name: "BlobArtifact" }, constraints: input.constraints as never, result: "mock" });
  if (registration.status !== "resolved" || registration.registration.kind !== "immediate") throw new Error(`No local mock capability configured for ${input.capability.name}`);
  const result = await registration.registration.handler({ command: { kind: "fulfill-need", id: "mock", need: { id: "mock", capability: input.capability, returns: registration.registration.returns, constraints: input.constraints as never, result: "mock" } }, need: { id: "mock", capability: input.capability, returns: registration.registration.returns, constraints: input.constraints as never, result: "mock" }, artifacts, credentials: {} });
  if (result.value.kind !== "blob") throw new Error("Mock Provider returned a non-Artifact value");
  const artifact = result.value;
  return {
    artifact,
    attachment: {
      artifact,
      open: async () => (async function* () {
        const bytes = await artifacts.get(artifact.digest);
        if (bytes !== undefined) yield bytes;
      })(),
    },
  };
}
