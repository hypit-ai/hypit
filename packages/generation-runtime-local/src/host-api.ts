import type { BlobAttachment } from "@hypit/generation-authoring/workspace";
import type { ExecutorOptions } from "@hypit/executor";
import type { CapabilityRef } from "@hypit/module";
import type { BuildDefinition } from "@hypit/generation-build";
import type { BuildView as CoreBuildView } from "@hypit/generation-build";
import type {
  ExecutionEnvironmentEndpointObservation,
  ExecutionEnvironmentEndpointPricingObservation,
  ExecutionEnvironmentEndpointQuery,
} from "@hypit/execution-environment";
import type { LocalExecutionEnvironmentHost } from "@hypit/execution-environment-local/host";
import type { CapacityReservation, OperationSnapshot } from "@hypit/generation-runtime";
import type { PublicationIntent } from "@hypit/generation-build";
import type { Product } from "@hypit/product";
import type { BuildCompletion, BuildExecutionStop, PublicationStoreLocation } from "./execution.js";
import type { ExecutionEnvironmentDoctorDiagnostic } from "@hypit/execution-environment-local/extension";

export type RuntimeHostActiveBuildSubmission = {
  readonly id: string;
  readonly state: CoreBuildView;
  readonly view: BuildView;
};

export type RuntimeHostFinishedBuildSubmission = {
  readonly id: string;
  readonly state: CoreBuildView;
  readonly completion: BuildCompletion;
};

export type RuntimeHostBuildSubmission = RuntimeHostActiveBuildSubmission | RuntimeHostFinishedBuildSubmission;

export type BuildActivity = "submitting" | "ready" | "running" | "waiting" | "finalizing";

type BuildOperationViewEvidence = {
  readonly receipt?: import("@hypit/execution-environment").OperationReceipt;
  readonly endpoint: string;
  readonly progress?: OperationSnapshot["progress"];
};

export type BuildOperationView = BuildOperationViewEvidence & (
  | { readonly status: "failed"; readonly failure: Extract<OperationSnapshot, { readonly status: "failed" }>["failure"] }
  | { readonly status: "pending" | "received" | "completed" | "cancelled"; readonly failure?: never }
);

/** Stable Host view. Runtime persistence records never cross this boundary. */
export type BuildView = {
  readonly id: string;
  readonly activity: BuildActivity;
  readonly outcome?: BuildCompletion["outcome"];
  readonly issue?: { readonly scope: "publication" | "cleanup"; readonly message: string };
  readonly stop?: BuildExecutionStop;
  readonly sourcePath?: string;
  readonly targets: readonly string[];
  /** Publications already materialized in this active Build; absence means none are ready yet. */
  readonly outputs?: Readonly<Record<string, Product>>;
  /** External Needs in the frozen Build Plan and the subset already accepted by Core. */
  readonly requests?: { readonly total: number; readonly completed: number };
  readonly operations: readonly BuildOperationView[];
  /** Activity reported by calls running in the local Worker. */
  readonly commands?: readonly {
    readonly endpoint: string;
    readonly progress: NonNullable<OperationSnapshot["progress"]>;
  }[];
};

export type RuntimeHostControl = {
  /** Build evidence while active. Finished evidence is read through project Build history. */
  logs?(build: string, lines: number): Promise<import("@hypit/generation-runtime").ExecutionLogView | undefined>;
  inspect(build: string): Promise<BuildView | undefined>;
  activity(): Promise<{
    readonly builds: readonly BuildView[];
    readonly capacity: readonly CapacityReservation[];
  }>;
  cancel(build: string, reason?: string): Promise<BuildView | undefined>;
  close(): void | Promise<void>;
};

export type RuntimeHostExecution = RuntimeHostControl & {
  build(request: {
    readonly id: string;
    readonly definition: BuildDefinition;
    readonly executionPackages?: readonly string[];
    readonly authoring: {
      readonly sourcePath: string;
      readonly targets: readonly string[];
      readonly publication: PublicationIntent;
    };
    readonly attachments?: readonly BlobAttachment[];
    /** Project-owned Build-history and Product roots, fixed before this Build becomes active. */
    readonly publicationStores: PublicationStoreLocation;
  }, options?: {
    readonly follow?: boolean;
    readonly pollIntervalMs?: number;
    readonly maxWaitMs?: number;
    readonly signal?: AbortSignal;
  }): Promise<RuntimeHostBuildSubmission>;
};

export type RuntimeHostDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly ExecutionEnvironmentDoctorDiagnostic[];
};

/** Shared Endpoint-owned observations exposed through this Host boundary. */
export type RuntimeHostEndpointObservation = ExecutionEnvironmentEndpointObservation;
export type RuntimeHostEndpointPricing = ExecutionEnvironmentEndpointPricingObservation;
export type RuntimeHostEndpointQuery = ExecutionEnvironmentEndpointQuery;

/** One immutable Profile and Endpoint activation snapshot, scoped to one command. */
export type RuntimeHostInspection = {
  readonly dataRoot: string;
  endpoints(): Promise<readonly RuntimeHostEndpointObservation[]>;
  pricing(): Promise<readonly RuntimeHostEndpointPricing[]>;
  preflight(): Promise<RuntimeHostDoctorResult>;
  executionStatus(): Promise<{ readonly state: "running" | "stopped" }>;
  ensureExecution(options?: { readonly maxWaitMs?: number }): Promise<{ readonly state: "running" | "stopped" }>;
  createRuntime(): Promise<RuntimeHostExecution>;
  close(): void | Promise<void>;
};

type RuntimeWorkerStateBase = {
  readonly profile: string;
  readonly logPath: string;
};

export type RuntimeWorkerState = RuntimeWorkerStateBase & (
  | { readonly state: "running"; readonly pid: number; readonly startedAt: number }
  | { readonly state: "stopped"; readonly pid?: never; readonly startedAt?: never }
);

export type RuntimeController = {
  readonly profile: string;
  readonly dataRoot: string;
  readonly worker: {
    up(options?: { readonly maxWaitMs?: number }): Promise<RuntimeWorkerState>;
    status(): Promise<RuntimeWorkerState>;
    logs(): Promise<{ readonly path: string; readonly text: string }>;
    down(options?: { readonly maxWaitMs?: number }): Promise<RuntimeWorkerState>;
  };
  readonly programs: {
    prepare(options?: { readonly endpoints?: readonly string[]; readonly onProgress?: (event: import("@hypit/execution-environment-local/programs").ManagedProgramProgress) => void }): Promise<{ readonly dataRoot: string; readonly programs: readonly import("@hypit/execution-environment-local/programs").ManagedProgramReport[] }>;
    up(options: {
      readonly maxWaitMs?: number;
      readonly onProgress?: (event: import("@hypit/execution-environment-local/programs").ManagedProgramProgress) => void;
      readonly capabilities?: readonly CapabilityRef[];
      readonly endpoints?: readonly string[];
    }): Promise<{ readonly dataRoot: string; readonly programs: readonly import("@hypit/execution-environment-local/programs").ManagedProgramReport[] }>;
    down(options?: { readonly endpoints?: readonly string[] }): Promise<{ readonly dataRoot: string; readonly programs: readonly import("@hypit/execution-environment-local/programs").ManagedProgramReport[] }>;
    report(options?: { readonly endpoints?: readonly string[] }): Promise<{ readonly dataRoot: string; readonly programs: readonly import("@hypit/execution-environment-local/programs").ManagedProgramReport[] }>;
  };
};

export type RuntimeWorkerLaunch = {
  readonly command: string;
  readonly args: readonly string[];
  readonly workerArgs?: readonly string[];
};

export type LocalRuntimeHost = {
  readonly profile: string;
  /** Shared local Environment used equally by CLI, Workbench, Desktop and Generation. */
  readonly environment: LocalExecutionEnvironmentHost;
  /** Profile execution policy consumed by CLI Producer planning before submission. */
  planningPolicy(): Promise<{
    readonly producerExecutionLimits?: NonNullable<ExecutorOptions["producerExecutionLimits"]>;
  }>;
  executionStatus(): Promise<{ readonly state: "running" | "stopped" }>;
  ensureExecution(options?: { readonly maxWaitMs?: number }): Promise<{ readonly state: "running" | "stopped" }>;
  resolvePaths(): Promise<{
    readonly packageRoot?: string;
    readonly runtimeDataRoot?: string;
    readonly environmentProfile?: string;
    readonly environmentDataRoot?: string;
  }>;
  controller(options?: {
    readonly packageRoot?: string;
  }): Promise<RuntimeController>;
  createRuntime(options?: { readonly endpoints?: readonly string[] }): Promise<RuntimeHostExecution>;
  openControl(options?: { readonly readOnly?: boolean }): Promise<RuntimeHostControl>;
  /** Freeze the Profile and Endpoint declarations used by one plan, pricing or Build command. */
  openInspection(queries: readonly RuntimeHostEndpointQuery[]): Promise<RuntimeHostInspection>;
  runWorker(readyFile: string, owner: string, execution?: { readonly dataRoot: string }): Promise<void>;
};
