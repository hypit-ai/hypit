import type { BlobRef, ResourceId } from "@hypit/protocol";
import {
  isStreamingResourceStore,
  type ResourceIOOptions,
  type ResourceStore,
  type StreamingResourceStore,
} from "@hypit/resource-store";

/**
 * Request-owned writable overlay above a prepared Programme's retained input resources.
 * Terminal products never mutate or accumulate in the long-lived Programme resource domain.
 */
export function createNleProgrammeResourceOverlay(
  inputs: ResourceStore,
  products: StreamingResourceStore,
): StreamingResourceStore {
  return {
    put: async (bytes: Uint8Array, mediaType: string, options: ResourceIOOptions = {}): Promise<BlobRef> =>
      await products.put(bytes, mediaType, options),
    putStream: async (chunks, mediaType, options = {}) =>
      await products.putStream(chunks, mediaType, options),
    write: async (resource, bytes, options = {}) => await products.write(resource, bytes, options),
    writeStream: async (resource, chunks, options = {}) =>
      await products.writeStream(resource, chunks, options),
    has: async (resource: ResourceId, options: ResourceIOOptions = {}): Promise<boolean> =>
      await products.has(resource, options) || await inputs.has(resource, options),
    get: async (resource: ResourceId, options: ResourceIOOptions = {}): Promise<Uint8Array | undefined> => {
      const own = await products.get(resource, options);
      return own ?? await inputs.get(resource, options);
    },
    open: async (resource: ResourceId, options: ResourceIOOptions = {}) => {
      const own = await products.open(resource, options);
      if (own !== undefined) return own;
      if (isStreamingResourceStore(inputs)) return await inputs.open(resource, options);
      const bytes = await inputs.get(resource, options);
      return bytes === undefined ? undefined : (async function* () { yield bytes; })();
    },
  };
}
