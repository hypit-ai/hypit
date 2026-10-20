import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type {
  Awaitable,
  ResolvedSource,
  SourceAssetRequest,
  SourceImportRequest,
  SourceUnit,
} from "@hypit/source";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import type {
  BlobAttachment,
  Workspace,
  WorkspaceSession,
} from "../index.js";
import { WorkspaceError } from "../index.js";
import type { BlobRef } from "@hypit/protocol";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

export type NodeFilesystemExternalSource = {
  readonly root: string;
  readonly source: string;
  /** Optional explicit override for sources that are not self-described text. */
  readonly frontend?: string;
};

export type NodeFilesystemExternalSourceResolver = (
  importer: SourceUnit,
  request: SourceImportRequest,
) => Awaitable<NodeFilesystemExternalSource>;

export type NodeFilesystemExternalAsset = {
  readonly root: string;
  readonly asset: string;
};

export type NodeFilesystemExternalAssetResolver = (
  importer: SourceUnit,
  request: SourceAssetRequest,
) => Awaitable<NodeFilesystemExternalAsset>;

export type NodeFilesystemSourceAdapter = (
  source: SourceUnit,
) => Awaitable<ResolvedSource>;

const utf8 = new TextDecoder("utf-8", { fatal: true });
const selfDescribedTextSource: NodeFilesystemSourceAdapter = (source) =>
  resolveSelfDescribedTextSource({ ...source, text: utf8.decode(source.bytes) });

class NodeFilesystemWorkspaceSession implements WorkspaceSession {
  readonly root: string;
  readonly entry: ResolvedSource;
  readonly #assetRoots: readonly string[];
  readonly #externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined;
  readonly #externalAssetResolver: NodeFilesystemExternalAssetResolver | undefined;
  readonly #sourceAdapter: NodeFilesystemSourceAdapter;
  readonly #sourceCache = new Map<string, SourceUnit>();
  readonly #sourceRoots = new Map<string, string>();
  readonly #assetIdentity = new Map<string, {
    readonly resource: BlobRef["resource"];
    readonly size: number;
  }>();
  readonly #attachments = new Map<string, BlobAttachment>();

  private constructor(
    root: string,
    entry: ResolvedSource,
    assetRoots: readonly string[],
    externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined,
    externalAssetResolver: NodeFilesystemExternalAssetResolver | undefined,
    sourceAdapter: NodeFilesystemSourceAdapter,
  ) {
    this.root = root;
    this.entry = entry;
    this.#assetRoots = assetRoots;
    this.#externalSourceResolver = externalSourceResolver;
    this.#externalAssetResolver = externalAssetResolver;
    this.#sourceAdapter = sourceAdapter;
    this.#sourceCache.set(entry.unit.id, entry.unit);
    this.#sourceRoots.set(entry.unit.id, root);
  }

  static async open(
    rootLocator: string,
    entryLocator: string,
    assetRootLocators: readonly string[],
    externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined,
    externalAssetResolver: NodeFilesystemExternalAssetResolver | undefined,
    sourceAdapter: NodeFilesystemSourceAdapter,
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
    const entryUnit: SourceUnit = {
      id: canonicalEntry,
      name: relative(root, canonicalEntry) || basename(canonicalEntry) || canonicalEntry,
      bytes: await readFile(canonicalEntry),
    };
    const entry = await sourceAdapter(entryUnit);
    return new NodeFilesystemWorkspaceSession(
      root,
      entry,
      [root, ...assetRoots],
      externalSourceResolver,
      externalAssetResolver,
      sourceAdapter,
    );
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
      bytes: await readFile(canonical),
    };
    this.#sourceCache.set(canonical, unit);
    this.#sourceRoots.set(canonical, sourceRoot);
    return unit;
  }

  readonly resolveSource = async (
    importer: SourceUnit,
    request: SourceImportRequest,
  ): Promise<ResolvedSource> => {
    const importerRoot = this.#sourceRoots.get(importer.id);
    if (importerRoot === undefined) {
      throw new WorkspaceError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Workspace`, importer.id);
    }
    if (request.from.startsWith("./") || request.from.startsWith("../")) {
      const unit = await this.#loadSource(resolve(dirname(importer.id), request.from), importerRoot);
      return await this.#sourceAdapter(unit);
    }
    if (this.#externalSourceResolver === undefined) {
      throw new WorkspaceError(
        "UNSUPPORTED_SOURCE_IMPORT",
        `Source import ${request.from} has no resolver in this Workspace`,
        request.from,
      );
    }
    const external = await this.#externalSourceResolver(importer, request);
    const unit = await this.#loadSource(external.source, external.root);
    return external.frontend === undefined
      ? await this.#sourceAdapter(unit)
      : { unit, frontend: external.frontend };
  };

  readonly resolveAsset = async (
    importer: SourceUnit,
    request: SourceAssetRequest,
  ) => {
    const importerRoot = this.#sourceRoots.get(importer.id);
    if (importerRoot === undefined) {
      throw new WorkspaceError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Workspace`, importer.id);
    }
    if (request.bytes !== undefined) {
      const bytes = Uint8Array.from(request.bytes);
      const blob: BlobRef = {
        kind: "blob",
        resource: `res_${randomUUID()}`,
        size: bytes.byteLength,
        mediaType: request.mediaType,
      };
      this.#attachments.set(`${blob.resource}\u0000${blob.mediaType}`, {
        blob: { ...blob },
        open: async () => (async function* () { yield Uint8Array.from(bytes); })(),
      });
      return { blob };
    }
    const relativeAsset = request.from.startsWith("./") || request.from.startsWith("../");
    let canonical: string;
    let allowedRoots: readonly string[];
    if (relativeAsset) {
      canonical = await realpath(resolve(dirname(importer.id), request.from));
      allowedRoots = importerRoot === this.root ? this.#assetRoots : [importerRoot];
    } else {
      if (this.#externalAssetResolver === undefined) {
        throw new WorkspaceError(
          "UNSUPPORTED_SOURCE_ASSET",
          `Source asset ${request.from} has no resolver in this Workspace`,
          request.from,
        );
      }
      const external = await this.#externalAssetResolver(importer, request);
      const externalRoot = await realpath(resolve(external.root));
      canonical = await realpath(resolve(external.asset));
      allowedRoots = [externalRoot];
    }
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
    const blob: BlobRef = {
      kind: "blob",
      resource: identity.resource,
      size: identity.size,
      mediaType: request.mediaType,
    };
    const attachmentKey = `${blob.resource}\u0000${blob.mediaType}`;
    if (!this.#attachments.has(attachmentKey)) {
      this.#attachments.set(attachmentKey, {
        blob: { ...blob },
        location: pathToFileURL(canonical).href,
        open: () => createReadStream(canonical),
        openRange: (range) => createReadStream(canonical, { start: range.start, end: range.endExclusive - 1 }),
      });
    }
    return { blob: { ...blob } };
  };

  attachments(): readonly BlobAttachment[] {
    return [...this.#attachments.values()]
      .sort((left, right) => {
        const byResource = left.blob.resource.localeCompare(right.blob.resource);
        return byResource === 0 ? left.blob.mediaType.localeCompare(right.blob.mediaType) : byResource;
      })
      .map((item) => ({ ...item, blob: { ...item.blob } }));
  }
}

export type NodeFilesystemWorkspaceOptions = {
  /** Fixed containment root. Defaults to the entry SourceUnit directory for each session. */
  readonly root?: string;
  /** Additional read-only roots for asset bytes. They never permit Source imports. */
  readonly assetRoots?: readonly string[];
  /** Host-owned resolver for explicit non-relative Source locators, each with its own read boundary. */
  readonly externalSourceResolver?: NodeFilesystemExternalSourceResolver;
  /** Host-owned resolver for explicit non-relative asset locators, each with its own read boundary. */
  readonly externalAssetResolver?: NodeFilesystemExternalAssetResolver;
  /** Selects a Frontend for each resolved Source. Defaults to the legacy self-described text adapter. */
  readonly sourceAdapter?: NodeFilesystemSourceAdapter;
};

/** Node filesystem implementation of the host-neutral, one-compilation Workspace contract. */
export class NodeFilesystemWorkspace implements Workspace {
  readonly #root: string | undefined;
  readonly #assetRoots: readonly string[];
  readonly #externalSourceResolver: NodeFilesystemExternalSourceResolver | undefined;
  readonly #externalAssetResolver: NodeFilesystemExternalAssetResolver | undefined;
  readonly #sourceAdapter: NodeFilesystemSourceAdapter;

  constructor(options: NodeFilesystemWorkspaceOptions = {}) {
    this.#root = options.root;
    this.#assetRoots = options.assetRoots ?? [];
    this.#externalSourceResolver = options.externalSourceResolver;
    this.#externalAssetResolver = options.externalAssetResolver;
    this.#sourceAdapter = options.sourceAdapter ?? selfDescribedTextSource;
  }

  async open(entryLocator: string): Promise<WorkspaceSession> {
    const entry = resolve(entryLocator);
    return await NodeFilesystemWorkspaceSession.open(
      this.#root ?? dirname(entry),
      entry,
      this.#assetRoots,
      this.#externalSourceResolver,
      this.#externalAssetResolver,
      this.#sourceAdapter,
    );
  }
}
