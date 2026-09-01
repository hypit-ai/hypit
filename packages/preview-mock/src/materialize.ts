import type { ArtifactAttachment } from "@hypit/workspace";
import type { BlobRef } from "@hypit/protocol";
import { MemoryResourceStore, EndpointRegistry } from "@hypit/driver-node";
import { createLocalMediaProvider } from "@hypit/provider-media-local";
import { mockMediaCapabilities } from "@hypit/mock-media";
type ResourceStore = {
  readonly get: (resource: BlobRef["resource"]) => Promise<Uint8Array | undefined>;
  readonly put: (bytes: Uint8Array, mediaType: string) => Promise<BlobRef>;
  readonly write: (resource: BlobRef, bytes: Uint8Array) => Promise<void>;
  readonly has: (resource: BlobRef["resource"]) => Promise<boolean>;
};

/**
 * Execute one mock Need with the local Provider.  Callers may provide the
 * project preview ResourceStore so the resulting bytes survive the process
 * which created the temporary Run (Studio is deliberately a separate
 * process).  The in-memory default is retained for small library callers.
 */
export async function materializeMockNeed(input: {
  readonly capability: typeof mockMediaCapabilities[keyof typeof mockMediaCapabilities];
  readonly constraints: unknown;
  readonly resources?: ResourceStore;
}): Promise<{ readonly artifact: BlobRef; readonly attachment: ArtifactAttachment }> {
  const resources = input.resources ?? new MemoryResourceStore();
  const registry = new EndpointRegistry();
  await createLocalMediaProvider({}).install(registry);
  const registration = registry.resolve({ id: "mock", capability: input.capability, returns: { module: { name: "@hypit/artifact", version: "1" }, name: "BlobArtifact" }, constraints: input.constraints as never, result: "mock" });
  if (registration.status !== "resolved" || registration.registration.kind !== "immediate") throw new Error(`No local mock capability configured for ${input.capability.name}`);
  const result = await registration.registration.handler({ command: { kind: "fulfill-need", id: "mock", need: { id: "mock", capability: input.capability, returns: registration.registration.returns, constraints: input.constraints as never, result: "mock" } }, need: { id: "mock", capability: input.capability, returns: registration.registration.returns, constraints: input.constraints as never, result: "mock" }, resources, credentials: {} });
  if (result.value.kind !== "blob") throw new Error("Mock Provider returned a non-Artifact value");
  const artifact = result.value;
  return {
    artifact,
    attachment: {
      artifact,
      open: async () => (async function* () {
        const bytes = await resources.get(artifact.resource);
        if (bytes !== undefined) yield bytes;
      })(),
    },
  };
}
