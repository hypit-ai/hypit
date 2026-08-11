import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  AuthorSourceAssetRequest,
  AuthorSourceImport,
  AuthorSourceUnit,
} from "@narratage/elaborator";
import type {
  ArtifactAttachment,
  Workspace,
  WorkspaceSession,
} from "@narratage/host";
import { WorkspaceError } from "@narratage/host";
import type { BlobRef } from "@narratage/protocol";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

class NodeFilesystemWorkspaceSession implements WorkspaceSession {
  readonly root: string;
  readonly entry: AuthorSourceUnit;
  readonly #sourceCache = new Map<string, AuthorSourceUnit>();
  readonly #sourceEdges = new Map<string, AuthorSourceUnit>();
  readonly #assetIdentity = new Map<string, { readonly digest: BlobRef["digest"]; readonly size: number }>();
  readonly #assetEdges = new Map<string, string>();
  readonly #attachments = new Map<string, ArtifactAttachment>();

  private constructor(root: string, entry: AuthorSourceUnit) {
    this.root = root;
    this.entry = entry;
    this.#sourceCache.set(entry.id, entry);
  }

  static async open(rootLocator: string, entryLocator: string): Promise<NodeFilesystemWorkspaceSession> {
    const root = await realpath(resolve(rootLocator));
    const canonicalEntry = await realpath(resolve(entryLocator));
    if (!isWithin(root, canonicalEntry)) {
      throw new WorkspaceError(
        "SOURCE_OUTSIDE_ROOT",
        `Source ${canonicalEntry} is outside workspace root ${root}`,
        canonicalEntry,
      );
    }
    const entry: AuthorSourceUnit = {
      id: canonicalEntry,
      name: relative(root, canonicalEntry) || canonicalEntry.split("/").at(-1) || canonicalEntry,
      text: await readFile(canonicalEntry, "utf8"),
    };
    return new NodeFilesystemWorkspaceSession(root, entry);
  }

  async #loadSource(path: string): Promise<AuthorSourceUnit> {
    const canonical = await realpath(resolve(path));
    if (!isWithin(this.root, canonical)) {
      throw new WorkspaceError(
        "SOURCE_OUTSIDE_ROOT",
        `Source ${canonical} is outside workspace root ${this.root}`,
        canonical,
      );
    }
    const cached = this.#sourceCache.get(canonical);
    if (cached !== undefined) return cached;
    const unit: AuthorSourceUnit = {
      id: canonical,
      name: relative(this.root, canonical) || canonical.split("/").at(-1) || canonical,
      text: await readFile(canonical, "utf8"),
    };
    this.#sourceCache.set(canonical, unit);
    return unit;
  }

  readonly resolveSource = async (
    importer: AuthorSourceUnit,
    request: AuthorSourceImport,
  ): Promise<AuthorSourceUnit> => {
    if (!request.from.startsWith("./") && !request.from.startsWith("../")) {
      throw new WorkspaceError(
        "UNSUPPORTED_SOURCE_IMPORT",
        `Source import ${request.from} must be relative; package imports are module imports`,
        request.from,
      );
    }
    if (!isWithin(this.root, importer.id)) {
      throw new WorkspaceError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Workspace`, importer.id);
    }
    const edge = `${importer.id}\u0000${request.from}`;
    const locked = this.#sourceEdges.get(edge);
    if (locked !== undefined) return locked;
    const loaded = await this.#loadSource(resolve(dirname(importer.id), request.from));
    this.#sourceEdges.set(edge, loaded);
    return loaded;
  };

  readonly resolveAsset = async (
    importer: AuthorSourceUnit,
    request: AuthorSourceAssetRequest,
  ) => {
    if (!request.from.startsWith("./") && !request.from.startsWith("../")) {
      throw new WorkspaceError(
        "UNSUPPORTED_SOURCE_ASSET",
        `Source asset ${request.from} must be relative`,
        request.from,
      );
    }
    if (!isWithin(this.root, importer.id)) {
      throw new WorkspaceError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Workspace`, importer.id);
    }
    const edge = `${importer.id}\u0000${request.from}`;
    let canonical = this.#assetEdges.get(edge);
    if (canonical === undefined) {
      canonical = await realpath(resolve(dirname(importer.id), request.from));
      if (!isWithin(this.root, canonical)) {
        throw new WorkspaceError(
          "SOURCE_ASSET_OUTSIDE_ROOT",
          `Source asset ${canonical} is outside workspace root ${this.root}`,
          canonical,
        );
      }
      this.#assetEdges.set(edge, canonical);
    }
    let identity = this.#assetIdentity.get(canonical);
    if (identity === undefined) {
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of createReadStream(canonical)) {
        hash.update(chunk);
        size += chunk.byteLength;
      }
      identity = { digest: `sha256:${hash.digest("hex")}`, size };
      this.#assetIdentity.set(canonical, identity);
    }
    const artifact: BlobRef = {
      kind: "blob",
      digest: identity.digest,
      size: identity.size,
      mediaType: request.mediaType,
    };
    const attachmentKey = `${artifact.digest}\u0000${artifact.mediaType}`;
    if (!this.#attachments.has(attachmentKey)) {
      this.#attachments.set(attachmentKey, {
        artifact: { ...artifact },
        open: () => createReadStream(canonical),
      });
    }
    return { artifact: { ...artifact } };
  };

  attachments(): readonly ArtifactAttachment[] {
    return [...this.#attachments.values()]
      .sort((left, right) => {
        const byDigest = left.artifact.digest.localeCompare(right.artifact.digest);
        return byDigest === 0 ? left.artifact.mediaType.localeCompare(right.artifact.mediaType) : byDigest;
      })
      .map((item) => ({ artifact: { ...item.artifact }, open: item.open }));
  }
}

export type NodeFilesystemWorkspaceOptions = {
  /** Fixed containment root. Defaults to the entry SourceUnit directory for each session. */
  readonly root?: string;
};

/** Node filesystem implementation of the host-neutral, one-compilation Workspace contract. */
export class NodeFilesystemWorkspace implements Workspace {
  readonly #root: string | undefined;

  constructor(options: NodeFilesystemWorkspaceOptions = {}) {
    this.#root = options.root;
  }

  async open(entryLocator: string): Promise<WorkspaceSession> {
    const entry = resolve(entryLocator);
    return await NodeFilesystemWorkspaceSession.open(this.#root ?? dirname(entry), entry);
  }
}
