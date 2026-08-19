import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  open as openFile,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { isDigest } from "@hypit/protocol";
import type { BlobRef, Digest } from "@hypit/protocol";
import type { ArtifactStore } from "@hypit/runtime";

function digestPath(root: string, digest: Digest): string {
  if (!isDigest(digest)) throw new Error("Artifact digest is invalid");
  const [algorithm, hex] = digest.split(":");
  if (algorithm !== "sha256" || hex === undefined) throw new Error(`unsupported Artifact digest ${digest}`);
  return join(root, algorithm, hex.slice(0, 2), hex);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Project-local content-addressed bytes. Metadata remains in the typed BlobRef that names them. */
export class FileArtifactStore implements ArtifactStore {
  readonly root: string;

  constructor(root: string) {
    if (root.trim().length === 0) throw new Error("Artifact root must not be empty");
    this.root = resolve(root);
  }

  async put(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
    const copy = Uint8Array.from(bytes);
    return await this.putStream((async function* () { yield copy; })(), mediaType);
  }

  async putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<BlobRef> {
    if (mediaType.trim().length === 0) throw new Error("Artifact mediaType must not be empty");
    const incoming = join(this.root, ".incoming");
    await mkdir(incoming, { recursive: true });
    const temporary = join(incoming, randomUUID());
    const handle = await openFile(temporary, "wx");
    const hash = createHash("sha256");
    let size = 0;
    try {
      try {
        for await (const value of chunks) {
          if (!(value instanceof Uint8Array)) throw new Error("Artifact stream yielded non-bytes");
          const chunk = Uint8Array.from(value);
          hash.update(chunk);
          size += chunk.byteLength;
          if (!Number.isSafeInteger(size)) throw new Error("Artifact stream exceeds the supported size");
          let offset = 0;
          while (offset < chunk.byteLength) {
            const written = await handle.write(chunk, offset, chunk.byteLength - offset);
            offset += written.bytesWritten;
          }
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    const digest = `sha256:${hash.digest("hex")}` as Digest;
    const path = digestPath(this.root, digest);
    await mkdir(dirname(path), { recursive: true });
    try {
      await link(temporary, path);
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) {
        await rm(temporary, { force: true });
        throw error;
      }
    }
    await rm(temporary, { force: true });
    return { kind: "blob", digest, size, mediaType };
  }

  async get(digest: Digest): Promise<Uint8Array | undefined> {
    const stream = await this.open(digest);
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

  async open(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined> {
    const path = digestPath(this.root, digest);
    try {
      if (!(await stat(path)).isFile()) throw new Error(`Artifact ${digest} is not a file`);
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
          const chunk = buffer.slice(0, result.bytesRead);
          yield chunk;
        }
      } finally {
        await handle.close();
      }
    })();
  }

  async has(digest: Digest): Promise<boolean> {
    try {
      return (await stat(digestPath(this.root, digest))).isFile();
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw error;
    }
  }

}
