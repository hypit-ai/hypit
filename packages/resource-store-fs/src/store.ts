import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  open as openFile,
  rm,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import { isResourceId } from "@hypit/protocol";
import type { BlobRef, ResourceId } from "@hypit/protocol";
import type { ResourceIOOptions, ResourceStore } from "@hypit/runtime";

function resourcePath(root: string, resource: ResourceId): string {
  if (!isResourceId(resource)) throw new Error("Resource id is invalid");
  return join(root, "resources", resource);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Build-local files keyed by opaque resource instance identity. */
export class FileResourceStore implements ResourceStore {
  readonly root: string;

  constructor(root: string) {
    if (root.trim().length === 0) throw new Error("Resource root must not be empty");
    this.root = resolve(root);
  }

  async #store(
    resource: ResourceId,
    chunks: AsyncIterable<Uint8Array>,
    options: ResourceIOOptions,
    expectedSize?: number,
  ): Promise<number> {
    options.signal?.throwIfAborted();
    const incoming = join(this.root, ".incoming");
    await mkdir(incoming, { recursive: true });
    const temporary = join(incoming, `res_${randomUUID()}`);
    const handle = await openFile(temporary, "wx");
    let size = 0;
    try {
      try {
        for await (const value of chunks) {
          options.signal?.throwIfAborted();
          if (!(value instanceof Uint8Array)) throw new Error("Resource stream yielded non-bytes");
          const chunk = Uint8Array.from(value);
          size += chunk.byteLength;
          if (!Number.isSafeInteger(size)) throw new Error("Resource stream exceeds the supported size");
          let offset = 0;
          while (offset < chunk.byteLength) {
            options.signal?.throwIfAborted();
            const written = await handle.write(chunk, offset, chunk.byteLength - offset);
            offset += written.bytesWritten;
          }
        }
      } finally {
        await handle.close();
      }
      options.signal?.throwIfAborted();
      if (expectedSize !== undefined && size !== expectedSize) {
        throw new Error(`Resource ${resource} has size ${size}, expected ${expectedSize}`);
      }
      const path = resourcePath(this.root, resource);
      await mkdir(join(this.root, "resources"), { recursive: true });
      try {
        options.signal?.throwIfAborted();
        await link(temporary, path);
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) throw error;
      }
      return size;
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async put(bytes: Uint8Array, mediaType: string, options: ResourceIOOptions = {}): Promise<BlobRef> {
    options.signal?.throwIfAborted();
    const copy = Uint8Array.from(bytes);
    return await this.putStream((async function* () { yield copy; })(), mediaType, options);
  }

  async putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string, options: ResourceIOOptions = {}): Promise<BlobRef> {
    if (mediaType.trim().length === 0) throw new Error("Resource mediaType must not be empty");
    const resource = `res_${randomUUID()}` as ResourceId;
    const size = await this.#store(resource, chunks, options);
    return { kind: "blob", resource, size, mediaType };
  }

  async write(resource: BlobRef, bytes: Uint8Array, options: ResourceIOOptions = {}): Promise<void> {
    options.signal?.throwIfAborted();
    const copy = Uint8Array.from(bytes);
    await this.writeStream(resource, (async function* () { yield copy; })(), options);
  }

  async writeStream(resource: BlobRef, chunks: AsyncIterable<Uint8Array>, options: ResourceIOOptions = {}): Promise<void> {
    if (!isResourceId(resource.resource)) throw new Error("Resource id is invalid");
    if (resource.mediaType.trim().length === 0) throw new Error("Resource mediaType must not be empty");
    await this.#store(resource.resource, chunks, options, resource.size);
  }

  async get(resource: ResourceId, options: ResourceIOOptions = {}): Promise<Uint8Array | undefined> {
    const stream = await this.open(resource, options);
    if (stream === undefined) return undefined;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of stream) {
      chunks.push(chunk);
      size += chunk.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  async open(resource: ResourceId, options: ResourceIOOptions = {}): Promise<AsyncIterable<Uint8Array> | undefined> {
    options.signal?.throwIfAborted();
    const path = resourcePath(this.root, resource);
    try {
      if (!(await stat(path)).isFile()) throw new Error(`Resource ${resource} is not a file`);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    }
    return (async function* () {
      options.signal?.throwIfAborted();
      const stream = createReadStream(path, { signal: options.signal });
      try {
        for await (const chunk of stream) yield Uint8Array.from(chunk as Buffer);
      } finally {
        stream.destroy();
      }
    })();
  }

  async has(resource: ResourceId, options: ResourceIOOptions = {}): Promise<boolean> {
    options.signal?.throwIfAborted();
    try {
      return (await stat(resourcePath(this.root, resource))).isFile();
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }
}
