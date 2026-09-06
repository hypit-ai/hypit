import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  Awaitable,
  SourceAssetRequest,
  SourceImportRequest,
  SourceUnit,
} from "@hypit/source";
import type {
  ArtifactAttachment,
  Workspace,
  WorkspaceSession,
} from "@hypit/workspace";
import { WorkspaceError } from "@hypit/workspace";
import type { BlobRef } from "@hypit/protocol";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

export type NodeFilesystemExternalSource = {
  readonly root: string;
  readonly source: string;
};

export type NodeFilesystemExternalSourceResolver = (
  importer: SourceUnit,
  request: SourceImportRequest,
) => Awaitable<NodeFilesystemExternalSource>;

class NodeFilesystemWorkspaceSession implements WorkspaceSession {
  readonly root: string;
  readonly entry: SourceUnit;
  readonly #assetRoots: readonly string[];
  readonly #externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined;
  readonly #sourceCache = new Map<string, SourceUnit>();
  readonly #sourceRoots = new Map<string, string>();
  readonly #assetIdentity = new Map<string, {
    readonly resource: BlobRef["resource"];
    readonly size: number;
  }>();
  readonly #attachments = new Map<string, ArtifactAttachment>();

  private constructor(
    root: string,
    entry: SourceUnit,
    assetRoots: readonly string[],
    externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined,
  ) {
    this.root = root;
    this.entry = entry;
    this.#assetRoots = assetRoots;
    this.#externalSourceResolver = externalSourceResolver;
    this.#sourceCache.set(entry.id, entry);
    this.#sourceRoots.set(entry.id, root);
  }

  static async open(
    rootLocator: string,
    entryLocator: string,
    assetRootLocators: readonly string[],
    externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined,
  ): Promise<NodeFilesystemWorkspaceSession> {
    const root = await realpath(resolve(rootLocator));
    const assetRoots = await Promise.all(assetRootLocators.map(async (path) => await realpath(resolve(path))));
    const canonicalEntry = await realpath(resolve(entryLocator));
    if (!isWithin(root, canonicalEntry)) {
      throw new WorkspaceError(
        "SOURCE_OUTSIDE_ROOT",
        `Source ${canonicalEntry} is outside workspace root ${root}`,
        canonicalEntry,
      );
    }
    const entry: SourceUnit = {
      id: canonicalEntry,
      name: relative(root, canonicalEntry) || basename(canonicalEntry) || canonicalEntry,
      text: await readFile(canonicalEntry, "utf8"),
    };
    return new NodeFilesystemWorkspaceSession(root, entry, [root, ...assetRoots], externalSourceResolver);
  }

  async #loadSource(path: string, sourceRootLocator: string): Promise<SourceUnit> {
    const sourceRoot = await realpath(resolve(sourceRootLocator));
    const canonical = await realpath(resolve(path));
    if (!isWithin(sourceRoot, canonical)) {
      throw new WorkspaceError(
        "SOURCE_OUTSIDE_ROOT",
        `Source ${canonical} is outside its source root ${sourceRoot}`,
        canonical,
      );
    }
    const cached = this.#sourceCache.get(canonical);
    if (cached !== undefined) {
      const previousRoot = this.#sourceRoots.get(canonical);
      if (previousRoot !== sourceRoot) {
        throw new WorkspaceError(
          "SOURCE_ROOT_CONFLICT",
          `Source ${canonical} was resolved through both ${previousRoot ?? "an unknown root"} and ${sourceRoot}`,
          canonical,
        );
      }
      return cached;
    }
    const unit: SourceUnit = {
      id: canonical,
      name: relative(sourceRoot, canonical) || basename(canonical) || canonical,
      text: await readFile(canonical, "utf8"),
    };
    this.#sourceCache.set(canonical, unit);
    this.#sourceRoots.set(canonical, sourceRoot);
    return unit;
  }

  readonly resolveSource = async (
    importer: SourceUnit,
    request: SourceImportRequest,
  ): Promise<SourceUnit> => {
    const importerRoot = this.#sourceRoots.get(importer.id);
    if (importerRoot === undefined) {
      throw new WorkspaceError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Workspace`, importer.id);
    }
    if (request.from.startsWith("./") || request.from.startsWith("../")) {
      return await this.#loadSource(resolve(dirname(importer.id), request.from), importerRoot);
    }
    if (this.#externalSourceResolver === undefined) {
      throw new WorkspaceError(
        "UNSUPPORTED_SOURCE_IMPORT",
        `Source import ${request.from} has no resolver in this Workspace`,
        request.from,
      );
    }
    const external = await this.#externalSourceResolver(importer, request);
    return await this.#loadSource(external.source, external.root);
  };

  readonly resolveAsset = async (
    importer: SourceUnit,
    request: SourceAssetRequest,
  ) => {
    if (!request.from.startsWith("./") && !request.from.startsWith("../")) {
      throw new WorkspaceError(
        "UNSUPPORTED_SOURCE_ASSET",
        `Source asset ${request.from} must be relative`,
        request.from,
      );
    }
    const importerRoot = this.#sourceRoots.get(importer.id);
    if (importerRoot === undefined) {
      throw new WorkspaceError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Workspace`, importer.id);
    }
    const canonical = await realpath(resolve(dirname(importer.id), request.from));
    const allowedRoots = importerRoot === this.root ? this.#assetRoots : [importerRoot];
    if (!allowedRoots.some((root) => isWithin(root, canonical))) {
      throw new WorkspaceError(
        "SOURCE_ASSET_OUTSIDE_ROOT",
        `Source asset ${canonical} is outside the workspace and every allowed asset root`,
        canonical,
      );
    }
    let identity = this.#assetIdentity.get(canonical);
    if (identity === undefined) {
      const size = (await stat(canonical)).size;
      identity = { resource: `res_${randomUUID()}`, size };
      this.#assetIdentity.set(canonical, identity);
    }
    const artifact: BlobRef = {
      kind: "blob",
      resource: identity.resource,
      size: identity.size,
      mediaType: request.mediaType,
    };
    const attachmentKey = `${artifact.resource}\u0000${artifact.mediaType}`;
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
        const byResource = left.artifact.resource.localeCompare(right.artifact.resource);
        return byResource === 0 ? left.artifact.mediaType.localeCompare(right.artifact.mediaType) : byResource;
      })
      .map((item) => ({ artifact: { ...item.artifact }, open: item.open }));
  }
}

export type NodeFilesystemWorkspaceOptions = {
  /** Fixed containment root. Defaults to the entry SourceUnit directory for each session. */
  readonly root?: string;
  /** Additional read-only roots for asset bytes. They never permit Source imports. */
  readonly assetRoots?: readonly string[];
  /** Host-owned resolver for explicit non-relative Source locators, each with its own read boundary. */
  readonly externalSourceResolver?: NodeFilesystemExternalSourceResolver;
};

/** Node filesystem implementation of the host-neutral, one-compilation Workspace contract. */
export class NodeFilesystemWorkspace implements Workspace {
  readonly #root: string | undefined;
  readonly #assetRoots: readonly string[];
  readonly #externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined;

  constructor(options: NodeFilesystemWorkspaceOptions = {}) {
    this.#root = options.root;
    this.#assetRoots = options.assetRoots ?? [];
    this.#externalSourceResolver = options.externalSourceResolver;
  }

  async open(entryLocator: string): Promise<WorkspaceSession> {
    const entry = resolve(entryLocator);
    return await NodeFilesystemWorkspaceSession.open(
      this.#root ?? dirname(entry),
      entry,
      this.#assetRoots,
      this.#externalSourceResolver,
    );
  }
}
