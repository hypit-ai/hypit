import type { ProjectBoundary, ProjectExecutionClient, ProjectHost } from "@hypit/project";

export type ApplicationProjectId = string;
export type ApplicationProjectLeaseHandle = string;
export type ApplicationProductSessionHandle = string;

export type ApplicationEvent = (
  | { readonly kind: "project.lease-opened" | "project.lease-closed"; readonly lease: ApplicationProjectLeaseHandle }
  | { readonly kind: "product.opened" | "product.closed"; readonly session: ApplicationProductSessionHandle }
) & { readonly project: ApplicationProjectId; readonly invalidated: readonly ["application"] };
export type ApplicationEventListener = (event: ApplicationEvent) => void;

export type IdentifiedApplicationProject = {
  readonly key: string;
  readonly input: unknown;
  readonly boundary: ProjectBoundary;
};

export type ApplicationProjectProvider = {
  identify(input: unknown): Promise<IdentifiedApplicationProject>;
  open(input: unknown, executionClients: readonly ProjectExecutionClient[]): Promise<ProjectHost>;
};

export type ApplicationProductSession = {
  close(): void | Promise<void>;
};

export type ApplicationProductLaunchParameter = {
  readonly name: string;
  readonly title: string;
  readonly required: boolean;
  readonly initial?: string;
  readonly placeholder?: string;
};

export type ApplicationProductProvider = {
  readonly product: string;
  readonly title: string;
  readonly launchParameters?: readonly ApplicationProductLaunchParameter[];
  open(project: ProjectHost, input: unknown): ApplicationProductSession | Promise<ApplicationProductSession>;
};

export type ApplicationProjectLease = {
  readonly handle: ApplicationProjectLeaseHandle;
  readonly project: ApplicationProjectId;
  readonly host: ProjectHost;
  close(): Promise<void>;
};

export type ApplicationProductSessionLease<Session extends ApplicationProductSession = ApplicationProductSession> = {
  readonly handle: ApplicationProductSessionHandle;
  readonly project: ApplicationProjectId;
  readonly product: string;
  readonly session: Session;
  close(): Promise<void>;
};

export type ApplicationProjection = {
  readonly products: readonly {
    readonly product: string;
    readonly title: string;
    readonly launchParameters: readonly ApplicationProductLaunchParameter[];
  }[];
  readonly projects: readonly {
    readonly id: ApplicationProjectId;
    readonly name: string;
    readonly leases: number;
    readonly sessions: readonly ApplicationProductSessionHandle[];
  }[];
  readonly sessions: readonly {
    readonly handle: ApplicationProductSessionHandle;
    readonly project: ApplicationProjectId;
    readonly product: string;
  }[];
  readonly execution: readonly {
    readonly id: string;
    readonly kind: string;
    readonly title: string;
  }[];
};
