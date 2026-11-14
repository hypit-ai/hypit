import type { BlobAttachment } from "@hypit/generation-authoring/workspace";
import type { CapabilityInvocationRequest } from "@hypit/endpoint";
import type { ExecutorOptions } from "@hypit/executor";
import type { Value } from "@hypit/protocol";
import type { CapabilityRef } from "@hypit/module";
import type { BuildDefinition, PublicationIntent } from "@hypit/generation-build";
import type { BuildView } from "@hypit/generation-build";
import type {
  CredentialAcquisition,
  CredentialRef,
  ExecutionEnvironmentEndpointObservation,
  ExecutionEnvironmentEndpointPricingObservation,
  ExecutionEnvironmentEndpointQuery,
} from "@hypit/execution-environment";
import type { CapacityReservation, OperationSnapshot } from "@hypit/generation-runtime";
import type { ResourceStore } from "@hypit/resource-store";
import type { Product } from "@hypit/product";

export type CliPublicationStoreLocation = {
  readonly root: string;
  readonly historyPath: string;
  readonly productsPath: string;
};

export type CliDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type CliBuildAuthoring = {
  readonly sourcePath: string;
  readonly targets: readonly string[];
  readonly outputs?: Readonly<Record<string, Product>>;
  readonly publication: PublicationIntent;
};

export type CliBuildView = {
  readonly id: string;
  readonly activity: "submitting" | "ready" | "running" | "waiting" | "finalizing";
  readonly outcome?: "complete" | "failed" | "cancelled";
  readonly issue?: { readonly scope: "publication" | "cleanup"; readonly message: string };
  readonly stop?: { readonly cause: "user-cancelled" | "execution-failed"; readonly reason?: string };
  readonly sourcePath?: string;
  readonly targets: readonly string[];
  readonly requests?: { readonly total: number; readonly completed: number };
  readonly operations: readonly ({
    readonly receipt?: import("@hypit/execution-environment").OperationReceipt;
    readonly endpoint: string;
    readonly progress?: OperationSnapshot["progress"];
  } & (
    | { readonly status: "failed"; readonly failure: Extract<OperationSnapshot, { readonly status: "failed" }>["failure"] }
    | { readonly status: "pending" | "received" | "completed" | "cancelled"; readonly failure?: never }
  ))[];
  readonly commands?: readonly {
    readonly endpoint: string;
    readonly progress: NonNullable<OperationSnapshot["progress"]>;
  }[];
};

export type CliBuildSubmission = {
  readonly id: string;
  readonly state: BuildView;
} & ({ readonly view: CliBuildView } | {
  readonly completion: {
    readonly build: string;
    readonly outcome: "complete" | "failed" | "cancelled";
    readonly reason?: string;
  };
});

export type CliCredentialStatus = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly kind: "secret" | "json";
  readonly ref: CredentialRef;
  readonly acquisition?: CredentialAcquisition;
  readonly writable: boolean;
  readonly configured: boolean;
};

export type CliRuntimeControl = {
  logs?(build: string, lines: number): Promise<import("@hypit/generation-runtime").ExecutionLogView | undefined>;
  inspect(build: string): Promise<CliBuildView | undefined>;
  activity(): Promise<{ readonly builds: readonly CliBuildView[]; readonly capacity: readonly CapacityReservation[] }>;
  cancel(build: string, reason?: string): Promise<CliBuildView | undefined>;
  close(): void | Promise<void>;
};

export type CliCredentialControl = {
  describeCredentials(endpoint?: string): Promise<readonly Omit<CliCredentialStatus, "configured">[]>;
  credentials(endpoint?: string): Promise<readonly CliCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<CliCredentialStatus>;
  deleteCredential(endpoint: string, slot: string): Promise<{ readonly deleted: boolean; readonly credential: CliCredentialStatus }>;
  close(): void | Promise<void>;
};

export type CliRuntime = CliRuntimeControl & {
  build(request: {
    readonly id: string;
    readonly definition: BuildDefinition;
    readonly executionPackages?: readonly string[];
    readonly authoring: CliBuildAuthoring;
    readonly attachments?: readonly BlobAttachment[];
    readonly publicationStores: CliPublicationStoreLocation;
  }, options?: {
    readonly follow?: boolean;
    readonly pollIntervalMs?: number;
    readonly maxWaitMs?: number;
    readonly signal?: AbortSignal;
  }): Promise<CliBuildSubmission>;
};

export type CliRuntimeDoctorResult = { readonly dataRoot: string; readonly diagnostics: readonly CliDiagnostic[] };

export type CliEndpointObservation = ExecutionEnvironmentEndpointObservation;
export type CliEndpointPricing = ExecutionEnvironmentEndpointPricingObservation;
export type CliEndpointQuery = ExecutionEnvironmentEndpointQuery;

/** One command-scoped Runtime snapshot; it owns no state beyond its lifetime. */
export type CliRuntimeInspection = {
  readonly dataRoot: string;
  endpoints(): Promise<readonly CliEndpointObservation[]>;
  pricing(): Promise<readonly CliEndpointPricing[]>;
  preflight(): Promise<CliRuntimeDoctorResult>;
  executionStatus(): Promise<{ readonly state: "running" | "stopped" }>;
  ensureExecution(options?: { readonly maxWaitMs?: number }): Promise<{ readonly state: "running" | "stopped" }>;
  createRuntime(): Promise<CliRuntime>;
  close(): void | Promise<void>;
};

export type CliInvocationObservation = {
  readonly reportProgress?: (progress: import("@hypit/execution-environment").OperationProgress) => Promise<void>;
  readonly reportDiagnostic?: (diagnostic: import("@hypit/execution-environment").ExecutionDiagnostic) => Promise<void>;
};

/** Environment services shared by every host projection; no Build or Worker is implied. */
export type CliEnvironmentHost = {
  readonly profile: string;
  readonly dataRoot: string;
  openCredentials(endpoint: string): Promise<CliCredentialControl>;
  preflight(options?: { readonly capabilities?: readonly CapabilityRef[]; readonly endpoints?: readonly string[] }): Promise<CliRuntimeDoctorResult>;
  doctor(options?: { readonly capabilities?: readonly CapabilityRef[]; readonly endpoints?: readonly string[] }): Promise<CliRuntimeDoctorResult>;
  endpoints(queries: readonly CliEndpointQuery[]): Promise<readonly CliEndpointObservation[]>;
  pricing(queries: readonly CliEndpointQuery[]): Promise<readonly CliEndpointPricing[]>;
  invoke(request: CapabilityInvocationRequest, resources: ResourceStore, observation?: CliInvocationObservation): Promise<Value>;
};

/** Runtime services consumed by the generic long-compilation command engine. */
export type CliRuntimeHost = {
  readonly profile: string;
  readonly environment: CliEnvironmentHost;
  /** Host execution policy used before submission. Omission selects Executor defaults. */
  planningPolicy?(): Promise<{
    readonly producerExecutionLimits?: NonNullable<ExecutorOptions["producerExecutionLimits"]>;
  }>;
  /** Availability of the execution service selected by this Runtime implementation. */
  executionStatus(): Promise<{ readonly state: "running" | "stopped" }>;
  /** Make the selected execution service available before accepting durable work. */
  ensureExecution(options?: { readonly maxWaitMs?: number }): Promise<{ readonly state: "running" | "stopped" }>;
  createRuntime(options?: { readonly endpoints?: readonly string[] }): Promise<CliRuntime>;
  openControl(options?: { readonly readOnly?: boolean }): Promise<CliRuntimeControl>;
  openInspection(queries: readonly CliEndpointQuery[]): Promise<CliRuntimeInspection>;
};
