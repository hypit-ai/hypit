import type { ProjectMediaCatalog, ProjectMediaService } from "@hypit/media-asset/service";
import { ProjectDocumentRegistry, type OpenProjectDocumentObservation } from "./document-registry.js";
import type { ProjectPackageEnvironment } from "./package-environment.js";
import type { ProjectResourceGateway } from "./resources.js";
import type { ProjectBoundary, ProjectExecutionClient } from "./types.js";

export type ProjectHostContext = {
  readonly boundary: ProjectBoundary;
  readonly packages: ProjectPackageEnvironment;
  readonly media: ProjectMediaService;
  readonly resources: ProjectResourceGateway;
  readonly executionClients: readonly ProjectExecutionClient[];
  refreshExecutionClients(): Promise<readonly ProjectExecutionClient[]>;
};

export type ProjectExecutionDiscovery = (known: ReadonlySet<string>, signal: AbortSignal) => Promise<{
  readonly available: readonly string[];
  readonly clients: readonly ProjectExecutionClient[];
}>;

export type OpenProjectHostOptions = Omit<ProjectHostContext, "refreshExecutionClients"> & {
  readonly discoverExecutionClients?: ProjectExecutionDiscovery;
};

export type ProjectHostEvent =
  | { readonly kind: "media.catalog"; readonly generation: number; readonly invalidated: readonly ["media"] }
  | { readonly kind: "documents.changed"; readonly invalidated: readonly ["documents"] };

export type ProjectHostEventListener = (event: ProjectHostEvent) => void;

export type ProjectHostProjection = {
  readonly name: string;
  readonly packages: readonly string[];
  readonly executionEnvironments: readonly string[];
  readonly catalog: readonly { readonly package: string; readonly id: string; readonly kind: string; readonly title: string }[];
  readonly documents: readonly OpenProjectDocumentObservation[];
  readonly media: ProjectMediaCatalog;
};

export class ProjectHost {
  readonly boundary: ProjectBoundary;
  readonly packages: ProjectPackageEnvironment;
  readonly media: ProjectMediaService;
  readonly resources: ProjectResourceGateway;
  readonly #initialExecutionClients: readonly ProjectExecutionClient[];
  readonly #executionClients = new Map<string, ProjectExecutionClient>();
  readonly #discoverExecutionClients: ProjectExecutionDiscovery | undefined;
  readonly #lifetime = new AbortController();
  #refreshingExecution: Promise<readonly ProjectExecutionClient[]> | undefined;
  readonly documents: ProjectDocumentRegistry<ProjectHostContext>;
  readonly #listeners = new Set<ProjectHostEventListener>();
  readonly #unsubscribeMedia: () => void;
  readonly #unsubscribeDocuments: () => void;
  #closePromise: Promise<void> | undefined;

  constructor(options: OpenProjectHostOptions) {
    for (const entry of options.executionClients) {
      if (!/^[a-z][a-z0-9.-]{0,191}$/u.test(entry.environment)
        || entry.client?.environment !== entry.environment || typeof entry.close !== "function") {
        throw new Error("ProjectHost AIGC execution client is invalid.");
      }
      if (this.#executionClients.has(entry.environment)) {
        throw new Error(`ProjectHost repeats Execution Environment ${entry.environment}.`);
      }
      this.#executionClients.set(entry.environment, entry);
    }
    this.boundary = {
      root: options.boundary.root,
      manifest: structuredClone(options.boundary.manifest),
    };
    this.packages = options.packages;
    this.media = options.media;
    this.resources = options.resources;
    this.#initialExecutionClients = [...options.executionClients];
    this.#discoverExecutionClients = options.discoverExecutionClients;
    this.documents = new ProjectDocumentRegistry<ProjectHostContext>(this);
    this.#unsubscribeMedia = this.media.subscribe(({ generation }) =>
      this.#emit({ kind: "media.catalog", generation, invalidated: ["media"] }));
    this.#unsubscribeDocuments = this.documents.subscribe(() =>
      this.#emit({ kind: "documents.changed", invalidated: ["documents"] }));
  }

  get executionClients(): readonly ProjectExecutionClient[] { return [...this.#executionClients.values()]; }

  async refreshExecutionClients(): Promise<readonly ProjectExecutionClient[]> {
    this.#lifetime.signal.throwIfAborted();
    const discover = this.#discoverExecutionClients;
    if (discover === undefined) return this.executionClients;
    const refreshing = this.#refreshingExecution ??= (async () => {
      const { available, clients } = await discover(new Set(this.#executionClients.keys()), this.#lifetime.signal);
      for (const entry of clients) this.#executionClients.set(entry.environment, entry);
      return [...new Set([...this.#initialExecutionClients, ...available.flatMap(id => {
        const entry = this.#executionClients.get(id);
        return entry === undefined ? [] : [entry];
      })])];
    })();
    try { return await refreshing; }
    finally { if (this.#refreshingExecution === refreshing) this.#refreshingExecution = undefined; }
  }

  subscribe(listener: ProjectHostEventListener): () => void {
    if (this.#closePromise !== undefined) throw new Error("ProjectHost is closed.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async observe(): Promise<ProjectHostProjection> {
    const media = await this.media.observe();
    return {
      name: this.boundary.manifest.name,
      packages: this.packages.packages(),
      executionEnvironments: this.executionClients.map(entry => entry.environment),
      catalog: this.packages.catalog().map(({ package: name, id, kind, title }) => ({ package: name, id, kind, title })),
      documents: this.documents.observe(),
      media,
    };
  }

  executionClient(environment: string): ProjectExecutionClient | undefined {
    if (this.#closePromise !== undefined) throw new Error("ProjectHost is closed.");
    return this.#executionClients.get(environment);
  }

  #emit(event: ProjectHostEvent): void {
    for (const listener of this.#listeners) {
      try { listener(structuredClone(event)); } catch { /* Observers cannot veto a Project change. */ }
    }
  }

  close(): Promise<void> {
    this.#closePromise ??= (async () => {
      this.#lifetime.abort();
      this.#unsubscribeMedia();
      this.#unsubscribeDocuments();
      this.#listeners.clear();
      const failures: unknown[] = [];
      await this.documents.close().catch((error) => failures.push(error));
      this.resources.close();
      this.media.close();
      await this.#refreshingExecution?.catch(() => undefined);
      for (const entry of [...this.executionClients].reverse()) {
        try { await entry.close(); } catch (error) { failures.push(error); }
      }
      if (failures.length > 0) throw failures[0];
    })();
    return this.#closePromise;
  }
}

export function openProjectHost(options: OpenProjectHostOptions): ProjectHost {
  return new ProjectHost(options);
}
