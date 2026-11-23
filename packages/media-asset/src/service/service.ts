import type { ResolvedMedia } from "@hypit/media";
import type { MediaAssetDocument, MediaAssetReference } from "../index.js";
import { ProjectMediaAssetRevisionConflict, readProjectMediaAssetEdit, type ProjectMediaAssetEdit } from "./asset-edit.js";
import {
  editProjectMediaFolders, moveProjectMediaAsset, parseProjectMediaLibrary, projectMediaLibrary, projectMediaLibraryFile,
  ProjectMediaLibraryRevisionConflict, readProjectMediaLibraryEdit,
  type ProjectMediaLibraryEdit, type ProjectMediaLibrarySnapshot,
} from "./library.js";
import type {
  ProjectMediaCatalog,
  ProjectMediaCollectionAdapter,
  ProjectMediaResourceResolver,
  ProjectMediaServiceListener,
} from "./types.js";
import type { ProjectMediaViews } from "./views.js";

/** One open lifetime for the Media Asset collection in a ProjectHost. */
export class ProjectMediaService {
  readonly views: ProjectMediaViews | undefined = undefined;
  readonly #adapter: ProjectMediaCollectionAdapter;
  readonly #listeners = new Set<ProjectMediaServiceListener>();
  readonly #libraryListeners = new Set<(revision: string) => void>();
  #writes: Promise<void> = Promise.resolve();
  #catalog: ProjectMediaCatalog = { generation: 0, entries: [] };
  #observed = false;
  #refreshing: Promise<ProjectMediaCatalog> | undefined;
  #closed = false;

  constructor(adapter: ProjectMediaCollectionAdapter) {
    if (adapter === null || typeof adapter !== "object"
      || typeof adapter.scan !== "function"
      || typeof adapter.readLibrary !== "function"
      || typeof adapter.writeLibrary !== "function"
      || typeof adapter.open !== "function"
      || typeof adapter.renameAsset !== "function"
      || typeof adapter.stageAssetRemoval !== "function"
      || typeof adapter.resolveMedia !== "function") {
      throw new Error("Project Media Service requires a complete collection adapter.");
    }
    this.#adapter = adapter;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Project Media Service is closed.");
  }

  async observe(): Promise<ProjectMediaCatalog> {
    this.#assertOpen();
    if (!this.#observed) return await this.refresh();
    return structuredClone(this.#catalog);
  }

  async refresh(): Promise<ProjectMediaCatalog> {
    this.#assertOpen();
    if (this.#refreshing !== undefined) return await this.#refreshing;
    const task = this.#adapter.scan().then((entries) => {
      this.#assertOpen();
      this.#catalog = {
        generation: this.#catalog.generation + 1,
        entries: structuredClone(entries),
      };
      this.#observed = true;
      const snapshot = structuredClone(this.#catalog);
      for (const listener of this.#listeners) {
        try {
          listener(structuredClone(snapshot));
        } catch {
          // Observation cannot veto a completed Catalog refresh.
        }
      }
      return snapshot;
    });
    this.#refreshing = task;
    try {
      return await task;
    } finally {
      if (this.#refreshing === task) this.#refreshing = undefined;
    }
  }

  async open(reference: MediaAssetReference): Promise<MediaAssetDocument> {
    this.#assertOpen();
    return await this.#adapter.open(structuredClone(reference));
  }

  editAsset(value: ProjectMediaAssetEdit, assertUnused: (asset: MediaAssetReference) => Promise<void>): Promise<ProjectMediaCatalog> {
    const request = readProjectMediaAssetEdit(value);
    return this.serializeWrite(async () => {
      const catalog = await this.observe();
      if (request.expectedGeneration !== catalog.generation) {
        throw new ProjectMediaAssetRevisionConflict(request.expectedGeneration, catalog.generation);
      }
      if (request.kind === "asset.rename") {
        const changed = await this.#adapter.renameAsset(request.asset, request.displayName);
        return changed ? await this.#refreshEditedCatalog() : catalog;
      }

      const library = await this.readLibrary();
      const placed = moveProjectMediaAsset(library.document.root, request.asset, null);
      await assertUnused(request.asset);
      const staged = await this.#adapter.stageAssetRemoval(request.asset);
      if (staged === undefined && !placed) throw new Error(`Project Media ${request.asset.path} is absent.`);
      let revision: string | undefined;
      try {
        if (placed) revision = await this.writeLibrary(library);
      } catch (error) {
        await staged?.restore();
        throw error;
      }
      try {
        await staged?.discard();
      } finally {
        if (revision !== undefined) this.publishLibrary(revision);
        await this.#refreshEditedCatalog();
      }
      return await this.observe();
    });
  }

  async #refreshEditedCatalog(): Promise<ProjectMediaCatalog> {
    await this.#refreshing;
    return await this.refresh();
  }

  protected async readLibrary(): Promise<{ revision: string; document: ReturnType<typeof parseProjectMediaLibrary> }> {
    this.#assertOpen();
    const { revision, source } = await this.#adapter.readLibrary();
    try {
      return { revision, document: parseProjectMediaLibrary(source) };
    } catch (error) {
      throw new Error(`Media ${projectMediaLibraryFile}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }

  protected async writeLibrary(library: Awaited<ReturnType<ProjectMediaService["readLibrary"]>>): Promise<string> {
    this.#assertOpen();
    return await this.#adapter.writeLibrary(JSON.stringify(library.document, null, 2) + "\n", library.revision);
  }

  protected serializeWrite<T>(write: () => Promise<T>): Promise<T> {
    const result = this.#writes.then(() => {
      this.#assertOpen();
      return write();
    });
    this.#writes = result.then(() => undefined, () => undefined);
    return result;
  }

  protected publishLibrary(revision: string): void {
    for (const listener of this.#libraryListeners) {
      try { listener(revision); } catch { /* Observation cannot veto a committed edit. */ }
    }
  }

  async observeLibrary(): Promise<ProjectMediaLibrarySnapshot> {
    const [{ revision, document }, catalog] = await Promise.all([this.readLibrary(), this.observe()]);
    return projectMediaLibrary(revision, document.root, catalog.entries.map(entry => entry.reference));
  }

  editLibrary(value: ProjectMediaLibraryEdit): Promise<ProjectMediaLibrarySnapshot> {
    const request = readProjectMediaLibraryEdit(value);
    return this.serializeWrite(async () => {
      const library = await this.readLibrary();
      if (request.expectedRevision !== library.revision) throw new ProjectMediaLibraryRevisionConflict();
      const { root } = library.document;
      const catalog = (await this.observe()).entries.map(entry => entry.reference);
      let changed: boolean;
      if (request.kind === "asset.move") {
        if (request.folder !== null && !catalog.some(reference => reference.path === request.asset.path)) {
          throw new Error(`Project Media ${request.asset.path} is absent from the Catalog.`);
        }
        changed = moveProjectMediaAsset(root, request.asset, request.folder);
      } else {
        changed = editProjectMediaFolders(root, request);
      }
      if (!changed) return projectMediaLibrary(library.revision, root, catalog);
      const revision = await this.writeLibrary(library);
      this.publishLibrary(revision);
      return projectMediaLibrary(revision, root, catalog);
    });
  }

  subscribeLibrary(listener: (revision: string) => void): () => void {
    this.#assertOpen();
    this.#libraryListeners.add(listener);
    return () => this.#libraryListeners.delete(listener);
  }

  async resolveMedia(
    reference: MediaAssetReference,
    resolver: ProjectMediaResourceResolver,
  ): Promise<ResolvedMedia> {
    this.#assertOpen();
    return await this.#adapter.resolveMedia(structuredClone(reference), resolver);
  }

  subscribe(listener: ProjectMediaServiceListener): () => void {
    this.#assertOpen();
    if (typeof listener !== "function") throw new Error("Project Media Service listener must be callable.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#listeners.clear();
    this.#libraryListeners.clear();
  }
}

export function openProjectMediaService(adapter: ProjectMediaCollectionAdapter): ProjectMediaService {
  return new ProjectMediaService(adapter);
}
