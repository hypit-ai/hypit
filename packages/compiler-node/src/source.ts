import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  AuthorSourceImport,
  AuthorSourceAssetResolver,
  AuthorSourceAssetRequest,
  AuthorSourceResolver,
  AuthorSourceUnit,
} from "@svml/elaborator";
import type { BlobRef } from "@svml/protocol";

import { NodeCompilerError } from "./error.js";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

/** One-build, read-once filesystem authority for SourceUnits. */
export class NodeSourceHost {
  readonly root: string;
  readonly #cache = new Map<string, AuthorSourceUnit>();
  readonly #edges = new Map<string, AuthorSourceUnit>();
  readonly #assetBytes = new Map<string, Uint8Array>();
  readonly #assetEdges = new Map<string, string>();
  readonly #attachments = new Map<string, NodeSourceArtifact>();

  private constructor(root: string) {
    this.root = root;
  }

  static async create(root: string): Promise<NodeSourceHost> {
    return new NodeSourceHost(await realpath(resolve(root)));
  }

  async load(path: string): Promise<AuthorSourceUnit> {
    const canonical = await realpath(resolve(path));
    if (!isWithin(this.root, canonical)) {
      throw new NodeCompilerError(
        "SOURCE_OUTSIDE_ROOT",
        `Source ${canonical} is outside compiler root ${this.root}`,
        canonical,
      );
    }
    const cached = this.#cache.get(canonical);
    if (cached !== undefined) return cached;
    const unit: AuthorSourceUnit = {
      id: canonical,
      name: relative(this.root, canonical) || canonical.split("/").at(-1) || canonical,
      text: await readFile(canonical, "utf8"),
    };
    this.#cache.set(canonical, unit);
    return unit;
  }

  readonly resolveSource: AuthorSourceResolver = async (
    importer: AuthorSourceUnit,
    request: AuthorSourceImport,
  ): Promise<AuthorSourceUnit> => {
    if (!request.from.startsWith("./") && !request.from.startsWith("../")) {
      throw new NodeCompilerError(
        "UNSUPPORTED_SOURCE_IMPORT",
        `Source import ${request.from} must be relative; package imports are module imports`,
        request.from,
      );
    }
    if (!isWithin(this.root, importer.id)) {
      throw new NodeCompilerError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Source Host`, importer.id);
    }
    const edge = `${importer.id}\u0000${request.from}`;
    const locked = this.#edges.get(edge);
    if (locked !== undefined) return locked;
    const loaded = await this.load(resolve(dirname(importer.id), request.from));
    this.#edges.set(edge, loaded);
    return loaded;
  };

  readonly resolveAsset: AuthorSourceAssetResolver = async (
    importer: AuthorSourceUnit,
    request: AuthorSourceAssetRequest,
  ) => {
    if (!request.from.startsWith("./") && !request.from.startsWith("../")) {
      throw new NodeCompilerError(
        "UNSUPPORTED_SOURCE_ASSET",
        `Source asset ${request.from} must be relative`,
        request.from,
      );
    }
    if (!isWithin(this.root, importer.id)) {
      throw new NodeCompilerError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Source Host`, importer.id);
    }
    const edge = `${importer.id}\u0000${request.from}`;
    let canonical = this.#assetEdges.get(edge);
    if (canonical === undefined) {
      canonical = await realpath(resolve(dirname(importer.id), request.from));
      if (!isWithin(this.root, canonical)) {
        throw new NodeCompilerError(
          "SOURCE_ASSET_OUTSIDE_ROOT",
          `Source asset ${canonical} is outside compiler root ${this.root}`,
          canonical,
        );
      }
      this.#assetEdges.set(edge, canonical);
    }
    let bytes = this.#assetBytes.get(canonical);
    if (bytes === undefined) {
      bytes = Uint8Array.from(await readFile(canonical));
      this.#assetBytes.set(canonical, bytes);
    }
    const artifact: BlobRef = {
      kind: "blob",
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      size: bytes.byteLength,
      mediaType: request.mediaType,
    };
    const attachmentKey = `${artifact.digest}\u0000${artifact.mediaType}`;
    if (!this.#attachments.has(attachmentKey)) {
      this.#attachments.set(attachmentKey, { artifact: { ...artifact }, bytes: Uint8Array.from(bytes) });
    }
    return { artifact: { ...artifact } };
  };

  /** Exact bytes requested during this compilation, detached from Host caches. */
  sourceArtifacts(): readonly NodeSourceArtifact[] {
    return [...this.#attachments.values()]
      .sort((left, right) => {
        const byDigest = left.artifact.digest.localeCompare(right.artifact.digest);
        return byDigest === 0 ? left.artifact.mediaType.localeCompare(right.artifact.mediaType) : byDigest;
      })
      .map((item) => ({ artifact: { ...item.artifact }, bytes: Uint8Array.from(item.bytes) }));
  }
}

export type NodeSourceArtifact = {
  readonly artifact: BlobRef;
  readonly bytes: Uint8Array;
};
