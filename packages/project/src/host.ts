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
};

export type OpenProjectHostOptions = ProjectHostContext;

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
  readonly executionClients: readonly ProjectExecutionClient[];
  readonly documents: ProjectDocumentRegistry<ProjectHostContext>;
  readonly #listeners = new Set<ProjectHostEventListener>();
  readonly #unsubscribeMedia: () => void;
  readonly #unsubscribeDocuments: () => void;
  #closePromise: Promise<void> | undefined;

  constructor(options: OpenProjectHostOptions) {
    const environments = new Set<string>();
    for (const entry of options.executionClients) {
      if (!/^[a-z][a-z0-9.-]{0,191}$/u.test(entry.environment)
        || entry.client?.environment !== entry.environment || typeof entry.close !== "function") {
        throw new Error("ProjectHost AIGC execution client is invalid.");
      }
      if (environments.has(entry.environment)) {
        throw new Error(`ProjectHost repeats Execution Environment ${entry.environment}.`);
      }
      environments.add(entry.environment);
    }
    this.boundary = {
      root: options.boundary.root,
      manifest: structuredClone(options.boundary.manifest),
    };
    this.packages = options.packages;
    this.media = options.media;
    this.resources = options.resources;
    this.executionClients = [...options.executionClients];
    this.documents = new ProjectDocumentRegistry<ProjectHostContext>({
      boundary: this.boundary,
      packages: this.packages,
      media: this.media,
      resources: this.resources,
      executionClients: this.executionClients,
    });
    this.#unsubscribeMedia = this.media.subscribe(({ generation }) =>
      this.#emit({ kind: "media.catalog", generation, invalidated: ["media"] }));
    this.#unsubscribeDocuments = this.documents.subscribe(() =>
      this.#emit({ kind: "documents.changed", invalidated: ["documents"] }));
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
    return this.executionClients.find(entry => entry.environment === environment);
  }

  #emit(event: ProjectHostEvent): void {
    for (const listener of this.#listeners) {
      try { listener(structuredClone(event)); } catch { /* Observers cannot veto a Project change. */ }
    }
  }

  close(): Promise<void> {
    this.#closePromise ??= (async () => {
      this.#unsubscribeMedia();
      this.#unsubscribeDocuments();
      this.#listeners.clear();
      const failures: unknown[] = [];
      await this.documents.close().catch((error) => failures.push(error));
      this.resources.close();
      this.media.close();
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
