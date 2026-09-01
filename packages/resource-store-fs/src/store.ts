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
import type { ResourceStore } from "@hypit/runtime";

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
    expectedSize?: number,
  ): Promise<number> {
    const incoming = join(this.root, ".incoming");
    await mkdir(incoming, { recursive: true });
    const temporary = join(incoming, `res_${randomUUID()}`);
    const handle = await openFile(temporary, "wx");
    let size = 0;
    try {
      try {
        for await (const value of chunks) {
          if (!(value instanceof Uint8Array)) throw new Error("Resource stream yielded non-bytes");
          const chunk = Uint8Array.from(value);
          size += chunk.byteLength;
          if (!Number.isSafeInteger(size)) throw new Error("Resource stream exceeds the supported size");
          let offset = 0;
          while (offset < chunk.byteLength) {
            const written = await handle.write(chunk, offset, chunk.byteLength - offset);
            offset += written.bytesWritten;
          }
        }
      } finally {
        await handle.close();
      }
      if (expectedSize !== undefined && size !== expectedSize) {
        throw new Error(`Resource ${resource} has size ${size}, expected ${expectedSize}`);
      }
      const path = resourcePath(this.root, resource);
      await mkdir(join(this.root, "resources"), { recursive: true });
      try {
        await link(temporary, path);
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) throw error;
      }
      return size;
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async put(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
    const copy = Uint8Array.from(bytes);
    return await this.putStream((async function* () { yield copy; })(), mediaType);
  }

  async putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<BlobRef> {
    if (mediaType.trim().length === 0) throw new Error("Resource mediaType must not be empty");
    const resource = `res_${randomUUID()}` as ResourceId;
    const size = await this.#store(resource, chunks);
    return { kind: "blob", resource, size, mediaType };
  }

  async write(resource: BlobRef, bytes: Uint8Array): Promise<void> {
    const copy = Uint8Array.from(bytes);
    await this.writeStream(resource, (async function* () { yield copy; })());
  }

  async writeStream(resource: BlobRef, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    if (!isResourceId(resource.resource)) throw new Error("Resource id is invalid");
    if (resource.mediaType.trim().length === 0) throw new Error("Resource mediaType must not be empty");
    await this.#store(resource.resource, chunks, resource.size);
  }

  async get(resource: ResourceId): Promise<Uint8Array | undefined> {
    const stream = await this.open(resource);
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

  async open(resource: ResourceId): Promise<AsyncIterable<Uint8Array> | undefined> {
    const path = resourcePath(this.root, resource);
    try {
      if (!(await stat(path)).isFile()) throw new Error(`Resource ${resource} is not a file`);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    }
    return (async function* () {
      const handle = await openFile(path, "r");
      try {
        const buffer = new Uint8Array(1024 * 1024);
        let position = 0;
        while (true) {
          const result = await handle.read(buffer, 0, buffer.byteLength, position);
          if (result.bytesRead === 0) break;
          position += result.bytesRead;
          yield buffer.slice(0, result.bytesRead);
        }
      } finally {
        await handle.close();
      }
    })();
  }

  async has(resource: ResourceId): Promise<boolean> {
    try {
      return (await stat(resourcePath(this.root, resource))).isFile();
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }
}
