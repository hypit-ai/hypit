import type { ExecutionClientLease, ExecutionEnvironment } from "@hypit/execution";
import type { ProjectBoundary, ProjectExecutionClient, ProjectExecutionClientLease } from "@hypit/project";

export type ApplicationExecutionEnvironmentProjection = ExecutionEnvironment["projection"];

export type ApplicationAuthorizationStatus =
  | { readonly status: "disconnected" }
  | { readonly status: "connected" | "needs-refresh" | "reconnect"; readonly expiresAt: number;
      readonly refreshExpiresAt?: number };

export type ApplicationAuthorizationAttempt = {
  readonly id: string;
  readonly authorizationUrl: string;
  readonly expiresAt: number;
} & ({ readonly state: "pending" }
  | { readonly state: "complete"; readonly connection: ApplicationAuthorizationStatus }
  | { readonly state: "failed"; readonly error: string });

export type ApplicationExecutionAuthorization = {
  status(): Promise<ApplicationAuthorizationStatus>;
  disconnect(): Promise<void>;
  begin(manual: boolean): Promise<ApplicationAuthorizationAttempt>;
  observe(id: string): ApplicationAuthorizationAttempt;
  complete(id: string, proof: string): Promise<ApplicationAuthorizationAttempt>;
  cancel(id: string): void;
  close(): void;
};

/** Selected AIGC Provider/model deployment available to project-scoped Capability Invocation clients. */
export type ApplicationExecutionEnvironment = {
  readonly projection: ApplicationExecutionEnvironmentProjection;
  readonly local?: {
    connect(): ExecutionClientLease;
    readonly doctor?: NonNullable<ExecutionEnvironment["doctor"]>;
    readonly authorization?: ApplicationExecutionAuthorization;
  };
  openProjectClient(boundary: ProjectBoundary): ProjectExecutionClientLease | undefined
    | Promise<ProjectExecutionClientLease | undefined>;
  close(): void | Promise<void>;
};

/** Bind an Environment to the Projects selected by this application deployment. */
export function bindApplicationExecutionEnvironment(
  environment: ExecutionEnvironment,
  allowsProject: (boundary: ProjectBoundary) => boolean = () => true,
  local?: { readonly authorization?: ApplicationExecutionAuthorization },
): ApplicationExecutionEnvironment {
  return {
    projection: environment.projection,
    ...(local === undefined ? {} : { local: {
      connect: () => environment.connect(),
      ...(environment.doctor === undefined ? {} : { doctor: environment.doctor.bind(environment) }),
      ...(local.authorization === undefined ? {} : { authorization: local.authorization }),
    } }),
    openProjectClient: boundary => allowsProject(boundary) ? environment.connect() : undefined,
    close: () => {
      local?.authorization?.close();
      return environment.close();
    },
  };
}

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

  async openProjectClients(boundary: ProjectBoundary): Promise<readonly ProjectExecutionClient[]> {
    if (this.#closePromise !== undefined) throw new Error("Execution Directory is closed.");
    const clients: ProjectExecutionClient[] = [];
    try {
      for (const [id, environment] of this.#environments) {
        const lease = await environment.openProjectClient(structuredClone(boundary));
        if (lease !== undefined) {
          if (lease.client.environment !== id) {
            await lease.close();
            throw new Error(`Execution client identity differs from its Environment ${id}.`);
          }
          clients.push({ environment: id, client: lease.client, close: () => lease.close() });
        }
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
