import { randomUUID } from "node:crypto";

import type { BlobRef, ResourceId } from "@hypit/protocol";
import type { ResourceStore } from "@hypit/runtime";

export class MemoryResourceStore implements ResourceStore {
  readonly #values = new Map<ResourceId, Uint8Array>();

  async put(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
    const copy = Uint8Array.from(bytes);
    const resource = `res_${randomUUID()}` as ResourceId;
    this.#values.set(resource, copy);
    return { kind: "blob", resource, size: copy.byteLength, mediaType };
  }

  async write(resource: BlobRef, bytes: Uint8Array): Promise<void> {
    const copy = Uint8Array.from(bytes);
    if (copy.byteLength !== resource.size) {
      throw new Error(`Resource ${resource.resource} has size ${copy.byteLength}, expected ${resource.size}`);
    }
    if (!this.#values.has(resource.resource)) this.#values.set(resource.resource, copy);
  }

  async get(resource: ResourceId): Promise<Uint8Array | undefined> {
    const value = this.#values.get(resource);
    return value === undefined ? undefined : Uint8Array.from(value);
  }

  async has(resource: ResourceId): Promise<boolean> {
    return this.#values.has(resource);
  }
}
