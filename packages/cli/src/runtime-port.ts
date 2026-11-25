import type { BlobAttachment } from "@hypit/workspace";
import type { BuildResultForward } from "@hypit/result";
import type { ExecutorOptions, ExecutorRunResult, ProducerRegistry } from "@hypit/executor";
import type {
  BuildDefinition,
  BuildState,
  CanonicalValue,
  CapabilityRef,
  LogicalOutputRef,
  Need,
  StoredValue,
} from "@hypit/protocol";
import type {
  CapacityReservation,
  CredentialAcquisition,
  CredentialRef,
  OperationSnapshot,
  ResourceStore,
} from "@hypit/runtime";

export type CliResultRepositoryLocation = { readonly root: string; readonly path: string };

export type CliDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type CliBuildCatalogDescriptor = {
  readonly source: { readonly path: string };
  readonly run?: { readonly path: string };
  readonly targets?: readonly LogicalOutputRef[];
  readonly publishedOutputs: readonly {
    readonly displayName?: string;
    readonly name: string;
    readonly ref: LogicalOutputRef;
  }[];
};

export type CliBuildView = {
  readonly id: string;
  readonly createdAt: number;
  readonly activity: "submitting" | "ready" | "running" | "waiting" | "saving-result";
  readonly outcome?: "complete" | "failed" | "cancelled";
  readonly issue?: { readonly scope: "result" | "cleanup"; readonly message: string };
  readonly cancellationRequested: boolean;
  readonly stop?: { readonly cause: "user-cancelled" | "execution-failed"; readonly reason?: string };
  readonly source?: { readonly path: string };
  readonly run?: { readonly path: string };
  readonly targets: readonly string[];
  readonly requests?: { readonly total: number; readonly completed: number };
  readonly acceptedRecords: number;
  readonly outstandingCommands: number;
  readonly operations: readonly {
    readonly id?: string;
    readonly receipt?: import("@hypit/runtime").OperationReceipt;
    readonly wakeAt?: number;
    readonly endpoint: string;
    readonly status: OperationSnapshot["status"];
    readonly progress?: OperationSnapshot["progress"];
    readonly failure?: OperationSnapshot["failure"];
  }[];
  readonly commands?: readonly {
    readonly id: string;
    readonly endpoint: string;
    readonly progress: NonNullable<OperationSnapshot["progress"]>;
  }[];
};

export type CliBuildSubmission = {
  readonly id: string;
  readonly state: BuildState;
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
  logs?(build: string, lines: number): Promise<import("@hypit/runtime").ExecutionLogView | undefined>;
  inspect(build: string): Promise<CliBuildView | undefined>;
  activity(): Promise<{ readonly builds: readonly CliBuildView[]; readonly capacity: readonly CapacityReservation[] }>;
  cancel(build: string, reason?: string): Promise<CliBuildView | undefined>;
  close(): void | Promise<void>;
};

export type CliResultControl = {
  finishResult(build: string): Promise<{
    readonly id: string;
    readonly outcome: "complete" | "failed" | "cancelled";
    readonly issue?: { readonly scope: "result" | "cleanup"; readonly message: string };
  } | undefined>;
  discardSubmission(build: string): Promise<boolean>;
  close(): void | Promise<void>;
};

export type CliCredentialControl = {
  describeCredentials(endpoint?: string): Promise<readonly Omit<CliCredentialStatus, "configured">[]>;
  credentials(endpoint?: string): Promise<readonly CliCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<CliCredentialStatus>;
  deleteCredential(endpoint: string, slot: string): Promise<{ readonly deleted: boolean; readonly credential: CliCredentialStatus }>;
  close(): void | Promise<void>;
};

export type CliRuntime = CliRuntimeControl & CliCredentialControl & CliResultControl & {
  build(request: {
    readonly id: string;
    readonly definition: BuildDefinition;
    readonly executionPackages?: readonly string[];
    readonly catalog: CliBuildCatalogDescriptor;
    readonly attachments?: readonly BlobAttachment[];
    readonly result: {
      readonly repository: CliResultRepositoryLocation;
      readonly title?: string;
      readonly forwards?: readonly BuildResultForward[];
      readonly resourceReferences?: Readonly<Record<string, import("@hypit/result").BuildResultFileRef>>;
    };
  }, options?: {
    readonly follow?: boolean;
    readonly pollIntervalMs?: number;
    readonly maxWaitMs?: number;
    readonly signal?: AbortSignal;
  }): Promise<CliBuildSubmission>;
};

export type CliRuntimeDoctorResult = { readonly dataRoot: string; readonly diagnostics: readonly CliDiagnostic[] };

export type CliTransientExecution = {
  evaluate(input: {
    readonly state: BuildState;
    readonly producers: ProducerRegistry;
    readonly validators: NonNullable<ExecutorOptions["validators"]>;
    readonly resources: ResourceStore;
  }): Promise<ExecutorRunResult>;
  close(): void | Promise<void>;
};

export type CliCapabilityProvider = {
  readonly request: string;
  readonly capability: CapabilityRef;
  readonly status: "resolved" | "unresolved" | "unsupported" | "ambiguous";
  readonly endpoint?: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: readonly string[];
  readonly rejections?: readonly { readonly endpoint: string; readonly message: string }[];
  readonly binding?: string;
};

export type CliCapabilityPricing = CliCapabilityProvider & {
  readonly pricingDocuments?: readonly { readonly source: string; readonly data: CanonicalValue; readonly summary?: string }[];
  readonly pricingError?: string;
};

export type CliProviderQuery = {
  readonly request: string;
  readonly capability: CapabilityRef;
  readonly returns: import("@hypit/protocol").TypeRef;
  readonly constraints: CanonicalValue;
  readonly pendingInputs?: readonly { readonly input: string; readonly role?: string }[];
};

export type CliInvocationObservation = {
  readonly reportProgress?: (progress: import("@hypit/runtime").OperationProgress) => Promise<void>;
  readonly reportDiagnostic?: (diagnostic: import("@hypit/runtime").ExecutionDiagnostic) => Promise<void>;
};

/** Runtime services consumed by the generic long-compilation command engine. */
export type CliRuntimeHost = {
  readonly profile: string;
  /** Validate the selected Runtime configuration without starting execution. */
  resolvePaths?(): Promise<{ readonly packageRoot?: string; readonly runtimeDataRoot?: string }>;
  /** Availability of the execution service selected by this Runtime implementation. */
  executionStatus(): Promise<{ readonly state: "running" | "stopped" }>;
  /** Make the selected execution service available before accepting durable work. */
  ensureExecution(options?: { readonly maxWaitMs?: number }): Promise<{ readonly state: "running" | "stopped" }>;
  createRuntime(options?: { readonly endpoints?: readonly string[] }): Promise<CliRuntime>;
  openControl(options?: { readonly readOnly?: boolean }): Promise<CliRuntimeControl>;
  openResultControl(): Promise<CliResultControl>;
  openCredentials(endpoint: string): Promise<CliCredentialControl>;
  preflight(options?: { readonly capabilities?: readonly CapabilityRef[]; readonly endpoints?: readonly string[] }): Promise<CliRuntimeDoctorResult>;
  doctor(options?: { readonly capabilities?: readonly CapabilityRef[]; readonly endpoints?: readonly string[] }): Promise<CliRuntimeDoctorResult>;
  providers(requests: readonly CliProviderQuery[]): Promise<readonly CliCapabilityProvider[]>;
  pricing(requests: readonly CliProviderQuery[]): Promise<readonly CliCapabilityPricing[]>;
  invoke(need: Need, resources: ResourceStore, observation?: CliInvocationObservation): Promise<{ readonly value: StoredValue }>;
  openTransientExecution(): Promise<CliTransientExecution>;
};
