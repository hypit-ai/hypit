import type { ProjectMediaService } from "@hypit/media-asset/service";
import { ProjectDocumentRegistry } from "./document-registry.js";
import type { ProjectPackageEnvironment } from "./package-environment.js";
import type { ProjectResourceGateway } from "./resources.js";
import type { ProjectBoundary, ProjectExecutorClient } from "./types.js";

export type ProjectHostContext = {
  readonly boundary: ProjectBoundary;
  readonly packages: ProjectPackageEnvironment;
  readonly media: ProjectMediaService;
  readonly resources: ProjectResourceGateway;
  readonly executorClients: readonly ProjectExecutorClient[];
};

export type OpenProjectHostOptions = ProjectHostContext;

export class ProjectHost {
  readonly boundary: ProjectBoundary;
  readonly packages: ProjectPackageEnvironment;
  readonly media: ProjectMediaService;
  readonly resources: ProjectResourceGateway;
  readonly executorClients: readonly ProjectExecutorClient[];
  readonly documents: ProjectDocumentRegistry<ProjectHostContext>;
  #closePromise: Promise<void> | undefined;

  constructor(options: OpenProjectHostOptions) {
    const executorKinds = new Set<string>();
    for (const entry of options.executorClients) {
      if (!/^[a-z][a-z0-9.-]{0,191}$/u.test(entry.kind) || typeof entry.close !== "function") {
        throw new Error("ProjectHost Executor client is invalid.");
      }
      if (executorKinds.has(entry.kind)) throw new Error(`ProjectHost repeats Executor client ${entry.kind}.`);
      executorKinds.add(entry.kind);
    }
    this.boundary = {
      root: options.boundary.root,
      manifest: structuredClone(options.boundary.manifest),
    };
    this.packages = options.packages;
    this.media = options.media;
    this.resources = options.resources;
    this.executorClients = [...options.executorClients];
    this.documents = new ProjectDocumentRegistry<ProjectHostContext>({
      boundary: this.boundary,
      packages: this.packages,
      media: this.media,
      resources: this.resources,
      executorClients: this.executorClients,
    });
  }

  close(): Promise<void> {
    this.#closePromise ??= (async () => {
      const failures: unknown[] = [];
      await this.documents.close().catch((error) => failures.push(error));
      this.resources.close();
      this.media.close();
      for (const entry of [...this.executorClients].reverse()) {
        await Promise.resolve(entry.close()).catch((error) => failures.push(error));
      }
      if (failures.length > 0) throw failures[0];
    })();
    return this.#closePromise;
  }
}

export function openProjectHost(options: OpenProjectHostOptions): ProjectHost {
  return new ProjectHost(options);
}
