import { stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { preparedPictureMemberExtent } from "@hypit/media";
import type { MediaAssetDocument } from "@hypit/media-asset";
import {
  attachMediaRepresentation,
  detachMediaRepresentation,
  mediaAssetDocumentFormat,
  replaceMediaRepresentation,
} from "@hypit/media-asset";
import {
  discoverMediaAssetDocuments,
  readMediaAssetDocumentFile,
  replaceMediaAssetDocumentFile,
} from "@hypit/media-asset/node";
import {
  assertProjectObjectRef,
  projectObjectRef,
  projectObjectRefKey,
  type ProjectObjectRef,
} from "@hypit/project";

import {
  projectMediaCatalogFormat,
  type ProjectMediaAssetView,
  type ProjectMediaCatalogView,
  type ProjectMediaRepresentationCommand,
  type ProjectMediaRepresentationReceipt,
} from "../types.js";
import {
  ProjectMediaRevisionConflict,
  type NodeProjectMediaService,
  type NodeProjectMediaServiceLease,
  type NodeProjectMediaServiceOptions,
  type NodeProjectMediaServicePool,
  type ProjectMediaFileResource,
  type ProjectMediaMaterialization,
} from "./types.js";
import {
  watchProjectMediaFiles,
  type ProjectMediaFileChange,
  type ProjectMediaFileWatch,
} from "./watch.js";
import { nodeFileObservationRevision } from "./file-observation.js";

type CachedMedia = {
  readonly view: ProjectMediaAssetView;
  readonly document?: MediaAssetDocument;
  readonly resource?: ProjectMediaFileResource;
  readonly manifestStamp?: FileStamp;
  readonly resourceStamp?: FileStamp;
};

type FileStamp = {
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
};

type Projection = {
  readonly view: ProjectMediaCatalogView;
  readonly byRef: ReadonlyMap<string, CachedMedia>;
};

const defaultScanConcurrency = 16;
const defaultWatchDebounceMs = 40;

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return selected;
}

function stamp(value: {
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
}): FileStamp {
  return { size: value.size, mtimeMs: value.mtimeMs, ctimeMs: value.ctimeMs };
}

function sameStamp(left: FileStamp | undefined, right: FileStamp): boolean {
  return left !== undefined && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function mapConcurrent<T, U>(
  values: readonly T[],
  concurrency: number,
  project: (value: T) => Promise<U>,
): Promise<U[]> {
  const projected = new Array<U>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next;
      next += 1;
      projected[index] = await project(values[index]!);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => await worker(),
  ));
  return projected;
}

function ownedFile(base: string, path: string, label: string): string {
  const target = resolve(base, path);
  const local = relative(base, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)
    || isAbsolute(local) || resolve(base, local) !== target) {
    throw new Error(`${label} ${path} leaves ${base}.`);
  }
  return target;
}

function seconds(value: { readonly ticks: string; readonly timeBase: {
  readonly numerator: number; readonly denominator: number;
} }): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function fallbackName(ref: ProjectObjectRef): string {
  return ref.path.split("/").at(-1)!.replace(/\.media\.json$/u, "");
}

/**
 * Project-scoped single writer plus one shared, watched in-memory Catalog projection.
 * Persistent indexing remains a replaceable implementation detail behind this boundary.
 */
class NodeProjectMediaApplicationService implements NodeProjectMediaService {
  readonly projectRoot: string;
  #projection: Projection | undefined;
  #refreshing: Promise<ProjectMediaCatalogView> | undefined;
  #writing: Promise<void> = Promise.resolve();
  #watch: ProjectMediaFileWatch;
  #watchTimer: ReturnType<typeof setTimeout> | undefined;
  #watchDirty = false;
  #watchFullRefresh = false;
  readonly #watchPaths = new Set<string>();
  #watchReconcile: Promise<void> | undefined;
  #reconciling: Promise<ProjectMediaCatalogView> | undefined;
  readonly #scanConcurrency: number;
  readonly #watchDebounceMs: number;
  readonly #listeners = new Set<(generation: number) => void>();
  #closing: Promise<void> | undefined;
  #closed = false;

  constructor(projectRoot: string, options: NodeProjectMediaServiceOptions = {}) {
    this.projectRoot = resolve(projectRoot);
    this.#scanConcurrency = positiveInteger(
      options.scanConcurrency, defaultScanConcurrency, "Project Media scan concurrency",
    );
    this.#watchDebounceMs = positiveInteger(
      options.watchDebounceMs, defaultWatchDebounceMs, "Project Media watch debounce",
    );
    // The watcher is established before the first full scan so changes during startup cannot be lost.
    this.#watch = watchProjectMediaFiles(this.projectRoot, (change) => this.#scheduleWatchReconcile(change));
  }

  get generation(): number | undefined {
    return this.#projection?.view.generation;
  }

  async #entry(ref: ProjectObjectRef, previous?: CachedMedia): Promise<CachedMedia> {
    const manifest = resolve(this.projectRoot, ref.path);
    let manifestStamp: FileStamp | undefined;
    try {
      manifestStamp = stamp(await stat(manifest));
      if (sameStamp(previous?.manifestStamp, manifestStamp) && previous?.resource !== undefined) {
        const resourceStat = stamp(await stat(previous.resource.file));
        if (sameStamp(previous.resourceStamp, resourceStat)) return previous;
      }
      const document = await readMediaAssetDocumentFile(manifest);
      const file = ownedFile(dirname(manifest), document.media.file.path, `Media Asset ${document.id} file`);
      const fileStat = await stat(file);
      if (!fileStat.isFile()) throw new Error(`${file} is not a file.`);
      const interpretation = document.media.interpretation;
      const picture = interpretation.picture;
      const kind = picture === undefined ? "audio" as const
        : picture.kind === "constant" ? "image" as const : "video" as const;
      const extent = picture === undefined ? undefined : preparedPictureMemberExtent(picture);
      return {
        document,
        resource: {
          file,
          mediaType: document.media.file.mediaType,
          size: fileStat.size,
          revision: nodeFileObservationRevision(stamp(fileStat)),
        },
        manifestStamp,
        resourceStamp: stamp(fileStat),
        view: {
          ref,
          revision: nodeFileObservationRevision(manifestStamp),
          resourceRevision: nodeFileObservationRevision(stamp(fileStat)),
          name: document.id,
          kind,
          mediaType: document.media.file.mediaType,
          size: fileStat.size,
          ...(interpretation.domain === undefined ? {} : { durationSeconds: seconds(interpretation.domain.duration) }),
          ...(extent === undefined ? {} : {
            width: Math.round(extent.widthPx),
            height: Math.round(extent.heightPx),
          }),
          hasAudio: interpretation.audio !== undefined,
          resourceAvailable: true,
        },
      };
    } catch (error) {
      return {
        ...(manifestStamp === undefined ? {} : { manifestStamp }),
        view: {
          ref,
          ...(manifestStamp === undefined ? {} : { revision: nodeFileObservationRevision(manifestStamp) }),
          name: fallbackName(ref),
          kind: "unknown",
          resourceAvailable: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async #build(): Promise<ProjectMediaCatalogView> {
    if (this.#closed) throw new Error("Project Media Service is closed.");
    const refs = await discoverMediaAssetDocuments(this.projectRoot);
    const previous = this.#projection?.byRef;
    const assets = await mapConcurrent(refs, this.#scanConcurrency, async (ref) => await this.#entry(
      ref,
      previous?.get(projectObjectRefKey(ref)),
    ));
    return this.#publish(assets);
  }

  #publish(assets: CachedMedia[]): ProjectMediaCatalogView {
    const previous = this.#projection;
    if (previous !== undefined && assets.length === previous.byRef.size
      && assets.every((asset) =>
        previous.byRef.get(projectObjectRefKey(asset.view.ref)) === asset)) {
      return structuredClone(previous.view);
    }
    const generation = (this.#projection?.view.generation ?? 0) + 1;
    assets.sort((left, right) => left.view.ref.path.localeCompare(right.view.ref.path));
    const view: ProjectMediaCatalogView = {
      format: projectMediaCatalogFormat,
      generation,
      assets: assets.map((asset) => structuredClone(asset.view)),
    };
    this.#projection = {
      view,
      byRef: new Map(assets.map((asset) => [projectObjectRefKey(asset.view.ref), asset])),
    };
    for (const listener of this.#listeners) {
      try { listener(generation); } catch { /* A projection observer cannot invalidate publication. */ }
    }
    return structuredClone(view);
  }

  #reconcileRefs(paths: readonly string[]): readonly ProjectObjectRef[] | undefined {
    const projection = this.#projection;
    if (projection === undefined) return undefined;
    const refs = new Map<string, ProjectObjectRef>();
    for (const path of paths) {
      if (path === "media") return undefined;
      if (path.endsWith(".media.json")) {
        const ref = projectObjectRef(path, mediaAssetDocumentFormat);
        refs.set(projectObjectRefKey(ref), ref);
        continue;
      }
      const target = resolve(this.projectRoot, path);
      let matched = false;
      for (const cached of projection.byRef.values()) {
        if (cached.resource?.file === target) {
          refs.set(projectObjectRefKey(cached.view.ref), cached.view.ref);
          matched = true;
        }
      }
      if (matched) continue;
      const prefix = path.endsWith("/") ? path : `${path}/`;
      if ([...projection.byRef.values()].some((cached) => cached.view.ref.path.startsWith(prefix))) {
        return undefined;
      }
    }
    return [...refs.values()];
  }

  async #buildIncremental(paths: readonly string[]): Promise<ProjectMediaCatalogView> {
    if (this.#projection === undefined) return await this.#build();
    const refs = this.#reconcileRefs(paths);
    if (refs === undefined) return await this.#build();
    if (refs.length === 0) return structuredClone(this.#projection.view);
    const byRef = new Map(this.#projection.byRef);
    const updates = await mapConcurrent(refs, this.#scanConcurrency, async (ref) => {
      const key = projectObjectRefKey(ref);
      const manifest = resolve(this.projectRoot, ref.path);
      const exists = await stat(manifest).then((value) => value.isFile(), (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      });
      return { key, value: exists ? await this.#entry(ref, byRef.get(key)) : undefined };
    });
    for (const update of updates) {
      if (update.value === undefined) byRef.delete(update.key);
      else byRef.set(update.key, update.value);
    }
    return this.#publish([...byRef.values()]);
  }

  async refresh(): Promise<ProjectMediaCatalogView> {
    if (this.#reconciling !== undefined) await this.#reconciling.catch(() => undefined);
    if (this.#refreshing !== undefined) return await this.#refreshing;
    const pending = this.#build();
    this.#refreshing = pending;
    try {
      return await pending;
    } finally {
      if (this.#refreshing === pending) this.#refreshing = undefined;
    }
  }

  async #reconcile(paths: readonly string[]): Promise<ProjectMediaCatalogView> {
    if (this.#refreshing !== undefined) await this.#refreshing.catch(() => undefined);
    if (this.#reconciling !== undefined) return await this.#reconciling;
    const pending = this.#buildIncremental(paths);
    this.#reconciling = pending;
    try {
      return await pending;
    } finally {
      if (this.#reconciling === pending) this.#reconciling = undefined;
    }
  }

  #scheduleWatchReconcile(change?: ProjectMediaFileChange): void {
    if (this.#closing !== undefined || this.#closed) return;
    if (change !== undefined) {
      this.#watchDirty = true;
      const cached = this.#projection === undefined ? [] : [...this.#projection.byRef.values()];
      if (change.kind === "unknown" || change.path === undefined
        || change.path === "media"
        || (change.kind === "rename"
          && !change.path.endsWith(".media.json")
          && !cached.some((entry) =>
            entry.resource?.file === resolve(this.projectRoot, change.path!)))) {
        this.#watchFullRefresh = true;
      } else {
        this.#watchPaths.add(change.path);
      }
    }
    if (this.#watchTimer !== undefined || this.#watchReconcile !== undefined) return;
    this.#watchTimer = setTimeout(() => {
      this.#watchTimer = undefined;
      this.#watchReconcile = (async () => {
        while (this.#watchDirty && this.#closing === undefined && !this.#closed) {
          this.#watchDirty = false;
          const full = this.#watchFullRefresh;
          const paths = [...this.#watchPaths];
          this.#watchFullRefresh = false;
          this.#watchPaths.clear();
          if (full) await this.refresh();
          else await this.#reconcile(paths);
        }
      })().catch(() => undefined).finally(() => {
        this.#watchReconcile = undefined;
        if (this.#watchDirty) this.#scheduleWatchReconcile();
      });
    }, this.#watchDebounceMs);
    this.#watchTimer.unref();
  }

  async observe(): Promise<ProjectMediaCatalogView> {
    if (this.#closed) throw new Error("Project Media Service is closed.");
    if (this.#projection === undefined) return await this.refresh();
    return structuredClone(this.#projection.view);
  }

  subscribe(listener: (generation: number) => void): () => void {
    if (this.#closed || this.#closing !== undefined) throw new Error("Project Media Service is closed.");
    this.#listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listener);
    };
  }

  resource(ref: ProjectObjectRef): ProjectMediaFileResource | undefined {
    assertProjectObjectRef(ref);
    if (ref.format !== mediaAssetDocumentFormat) return undefined;
    const value = this.#projection?.byRef.get(projectObjectRefKey(ref))?.resource;
    return value === undefined ? undefined : { ...value };
  }

  materialization(ref: ProjectObjectRef): ProjectMediaMaterialization | undefined {
    assertProjectObjectRef(ref);
    if (ref.format !== mediaAssetDocumentFormat) return undefined;
    const value = this.#projection?.byRef.get(projectObjectRefKey(ref));
    return value?.document === undefined
      ? undefined
      : { ref: { ...ref }, document: structuredClone(value.document) };
  }

  async #commitRepresentation(
    command: ProjectMediaRepresentationCommand,
  ): Promise<ProjectMediaRepresentationReceipt> {
    if (this.#closed) throw new Error("Project Media Service is closed.");
    assertProjectObjectRef(command.asset);
    if (command.asset.format !== mediaAssetDocumentFormat) {
      throw new Error(`Project Media command requires ${mediaAssetDocumentFormat}.`);
    }
    if (!command.asset.path.startsWith("media/")) {
      throw new Error(`Media Asset manifest ${command.asset.path} is outside the Project media namespace.`);
    }
    const manifest = ownedFile(this.projectRoot, command.asset.path, "Media Asset manifest");
    const observedRevision = nodeFileObservationRevision(stamp(await stat(manifest)));
    if (observedRevision !== command.assetRevision) {
      throw new ProjectMediaRevisionConflict(command.asset, command.assetRevision, observedRevision);
    }
    const current = await readMediaAssetDocumentFile(manifest);
    const representation = command.kind === "representation.attach"
      ? command.representation.id : command.id;
    const next = command.kind === "representation.attach"
      ? attachMediaRepresentation(current, command.representation)
      : command.kind === "representation.replace"
        ? replaceMediaRepresentation(current, command.id, command.representation)
        : detachMediaRepresentation(current, command.id);
    const currentRevision = nodeFileObservationRevision(stamp(await stat(manifest)));
    if (currentRevision !== command.assetRevision) {
      throw new ProjectMediaRevisionConflict(
        command.asset,
        command.assetRevision,
        currentRevision,
        `Media Asset ${command.asset.path} changed while the command was being prepared.`,
      );
    }
    await replaceMediaAssetDocumentFile(manifest, next);

    // A refresh that began before the atomic replace may publish its old read. Let it finish,
    // then force the next complete scan to become the visible generation.
    await this.#refreshing?.catch(() => undefined);
    await this.#reconciling?.catch(() => undefined);
    const catalog = await this.refresh();
    const assetRevision = catalog.assets.find((asset) =>
      projectObjectRefKey(asset.ref) === projectObjectRefKey(command.asset))?.revision;
    if (assetRevision === undefined) {
      throw new Error(`Media Asset ${command.asset.path} has no published revision after its command.`);
    }
    return {
      format: "hypit.media-service-representation-receipt@1",
      asset: { ...command.asset },
      assetRevision,
      representation,
      catalogGeneration: catalog.generation,
    };
  }

  async commitRepresentation(
    command: ProjectMediaRepresentationCommand,
  ): Promise<ProjectMediaRepresentationReceipt> {
    if (this.#closing !== undefined || this.#closed) throw new Error("Project Media Service is closed.");
    const operation = this.#writing.then(async () => await this.#commitRepresentation(command));
    this.#writing = operation.then(() => undefined, () => undefined);
    return await operation;
  }

  async close(): Promise<void> {
    if (this.#closing !== undefined) return await this.#closing;
    if (this.#closed) return;
    this.#closing = (async () => {
      this.#watch.close();
      if (this.#watchTimer !== undefined) clearTimeout(this.#watchTimer);
      this.#watchTimer = undefined;
      this.#watchDirty = false;
      this.#watchFullRefresh = false;
      this.#watchPaths.clear();
      await this.#writing.catch(() => undefined);
      await this.#watchReconcile?.catch(() => undefined);
      await this.#reconciling?.catch(() => undefined);
      this.#closed = true;
      this.#listeners.clear();
      this.#projection = undefined;
      await this.#refreshing?.catch(() => undefined);
    })();
    await this.#closing;
  }
}

export function createNodeProjectMediaService(
  projectRoot: string,
  options: NodeProjectMediaServiceOptions = {},
): NodeProjectMediaService {
  return new NodeProjectMediaApplicationService(projectRoot, options);
}

type PooledService = {
  readonly service: NodeProjectMediaService;
  leases: number;
};

/**
 * Lets independently opened Benches for one Project Boundary share one live Catalog.
 * Entries exist only while a surface holds a lease; the pool is not a project registry.
 */
export function createNodeProjectMediaServicePool(
  options: NodeProjectMediaServiceOptions = {},
): NodeProjectMediaServicePool {
  const entries = new Map<string, PooledService>();
  let closed = false;
  return {
    acquire(projectRoot): NodeProjectMediaServiceLease {
      if (closed) throw new Error("Project Media Service pool is closed.");
      const root = resolve(projectRoot);
      let entry = entries.get(root);
      if (entry === undefined) {
        entry = { service: createNodeProjectMediaService(root, options), leases: 0 };
        entries.set(root, entry);
      }
      entry.leases += 1;
      let released = false;
      return {
        service: entry.service,
        async release() {
          if (released) return;
          released = true;
          entry!.leases -= 1;
          if (entry!.leases !== 0 || entries.get(root) !== entry) return;
          entries.delete(root);
          await entry!.service.close();
        },
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      const active = [...entries.values()];
      entries.clear();
      await Promise.all(active.map(async (entry) => await entry.service.close()));
    },
  };
}
