import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { isDigest } from "@svml/protocol";
import type { BlobRef, Digest } from "@svml/protocol";
import type { ArtifactStore } from "@svml/runtime";

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
    if (mediaType.trim().length === 0) throw new Error("Artifact mediaType must not be empty");
    const copy = Uint8Array.from(bytes);
    const digest = `sha256:${createHash("sha256").update(copy).digest("hex")}` as Digest;
    const path = digestPath(this.root, digest);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, copy, { flag: "wx" });
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      // Existing content is not trusted merely because its path has the requested digest.
      await this.get(digest);
    }
    return { kind: "blob", digest, size: copy.byteLength, mediaType };
  }

  async get(digest: Digest): Promise<Uint8Array | undefined> {
    try {
      const bytes = Uint8Array.from(await readFile(digestPath(this.root, digest)));
      const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      if (actual !== digest) throw new Error(`Artifact ${digest} content digest differs`);
      return bytes;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    }
  }

  async has(digest: Digest): Promise<boolean> {
    return (await this.get(digest)) !== undefined;
  }
}
