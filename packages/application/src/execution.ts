import type { ProjectBoundary, ProjectExecutorClient } from "@hypit/project";

export type ApplicationExecutionEnvironmentProjection = {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
};

export type ApplicationExecutionEnvironment = {
  readonly projection: ApplicationExecutionEnvironmentProjection;
  openProjectClient(boundary: ProjectBoundary): ProjectExecutorClient | undefined
    | Promise<ProjectExecutorClient | undefined>;
  close(): void | Promise<void>;
};

function identity(value: string, label: string): void {
  if (!/^[a-z][a-z0-9.-]{0,191}$/u.test(value)) {
    throw new Error(`${label} must be a stable lowercase identity.`);
  }
}

export class ApplicationExecutionDirectory {
  readonly #environments: ReadonlyMap<string, ApplicationExecutionEnvironment>;
  #closePromise: Promise<void> | undefined;

  constructor(environments: readonly ApplicationExecutionEnvironment[] = []) {
    const selected = new Map<string, ApplicationExecutionEnvironment>();
    for (const environment of environments) {
      identity(environment.projection.id, "Execution Environment id");
      identity(environment.projection.kind, "Execution Environment kind");
      if (environment.projection.title.trim().length === 0) {
        throw new Error(`Execution Environment ${environment.projection.id} requires a title.`);
      }
      if (selected.has(environment.projection.id)) {
        throw new Error(`Execution Directory repeats Environment ${environment.projection.id}.`);
      }
      selected.set(environment.projection.id, environment);
    }
    this.#environments = selected;
  }

  observe(): readonly ApplicationExecutionEnvironmentProjection[] {
    return [...this.#environments.values()].map(({ projection }) => structuredClone(projection));
  }

  environment(id: string): ApplicationExecutionEnvironment | undefined {
    return this.#environments.get(id);
  }

  async openProjectClients(boundary: ProjectBoundary): Promise<readonly ProjectExecutorClient[]> {
    if (this.#closePromise !== undefined) throw new Error("Execution Directory is closed.");
    const clients: ProjectExecutorClient[] = [];
    try {
      for (const environment of this.#environments.values()) {
        const client = await environment.openProjectClient(structuredClone(boundary));
        if (client !== undefined) clients.push(client);
      }
      const kinds = new Set<string>();
      for (const client of clients) {
        if (kinds.has(client.kind)) {
          throw new Error(`Execution Directory repeats project client kind ${client.kind}.`);
        }
        kinds.add(client.kind);
      }
      return clients;
    } catch (error) {
      await Promise.allSettled(clients.reverse().map(async (client) => await client.close()));
      throw error;
    }
  }

  close(): Promise<void> {
    this.#closePromise ??= (async () => {
      const results = await Promise.allSettled([...this.#environments.values()].reverse()
        .map(async (environment) => await environment.close()));
      const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure !== undefined) throw failure.reason;
    })();
    return this.#closePromise;
  }
}

export function openApplicationExecutionDirectory(
  environments: readonly ApplicationExecutionEnvironment[] = [],
): ApplicationExecutionDirectory {
  return new ApplicationExecutionDirectory(environments);
}
