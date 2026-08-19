import { createHash } from "node:crypto";

import type { BlobRef, Digest } from "@hypit/protocol";

import type { ArtifactStore } from "@hypit/runtime";

export class MemoryArtifactStore implements ArtifactStore {
  readonly #values = new Map<Digest, Uint8Array>();

  async put(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
    const copy = Uint8Array.from(bytes);
    const digest = `sha256:${createHash("sha256").update(copy).digest("hex")}` as Digest;
    this.#values.set(digest, copy);
    return { kind: "blob", digest, size: copy.byteLength, mediaType };
  }

  async get(digest: Digest): Promise<Uint8Array | undefined> {
    const value = this.#values.get(digest);
    return value === undefined ? undefined : Uint8Array.from(value);
  }

  async has(digest: Digest): Promise<boolean> {
    return this.#values.has(digest);
  }
}
