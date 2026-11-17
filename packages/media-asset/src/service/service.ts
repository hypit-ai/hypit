import type { ResolvedMedia } from "@hypit/media";
import type { MediaAssetDocument, MediaAssetReference } from "../index.js";
import type {
  ProjectMediaCatalog,
  ProjectMediaCollectionAdapter,
  ProjectMediaResourceResolver,
  ProjectMediaServiceListener,
} from "./types.js";

/** One open lifetime for the Media Asset collection in a ProjectHost. */
export class ProjectMediaService {
  readonly #adapter: ProjectMediaCollectionAdapter;
  readonly #listeners = new Set<ProjectMediaServiceListener>();
  #catalog: ProjectMediaCatalog = { generation: 0, entries: [] };
  #observed = false;
  #refreshing: Promise<ProjectMediaCatalog> | undefined;
  #closed = false;

  constructor(adapter: ProjectMediaCollectionAdapter) {
    if (adapter === null || typeof adapter !== "object"
      || typeof adapter.scan !== "function"
      || typeof adapter.open !== "function"
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
  }
}

export function openProjectMediaService(adapter: ProjectMediaCollectionAdapter): ProjectMediaService {
  return new ProjectMediaService(adapter);
}
