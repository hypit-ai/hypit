import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Awaitable, ProducerPackage } from "@hypit/hypit/producer";
import type { EndpointInstance } from "@hypit/hypit/endpoint";
import type { LoadedPackage } from "@hypit/hypit/loader";
import type { BuildResultStore } from "@hypit/result/runtime-storage";
import type {
  ResourceStore,
  BuildStore,
  CredentialStore,
  OperationStore,
} from "@hypit/hypit/runtime";
import type { BuildCompletion, BuildExecutionStore, BuildExecutionSnapshot, BuildResultRepositoryLocation } from "./execution.js";
import type {
  RuntimeHostControl,
  RuntimeHostBuildSubmission,
  RuntimeHostCredentialControl,
  RuntimeHostExecution,
} from "./host-api.js";

type BuildResultRepositoryOpened = {
  readonly repository: BuildResultStore;
  readonly close?: () => void | Promise<void>;
};

export type CreateLocalRuntimeOptions = {
  /** Already assigned by the local coordinator. Embeddings omit this and start fresh work. */
  readonly executionBuild?: string;
  readonly executionContext?: import("@hypit/hypit/protocol").CanonicalValue;
  readonly producerExecutionLimits?: import("@hypit/hypit/producer").ProducerExecutionLimits;
  readonly executionLogs?: import("./log.js").LocalExecutionLogs;
  readonly buildStore: BuildStore;
  readonly operationStore: OperationStore;
  /** Durable receipt boundary: one immediate Command is never invoked twice for one Build. */
  readonly commandExecutionStore: import("@hypit/hypit/runtime").CommandExecutionStore;
  readonly executionStore: BuildExecutionStore;
  readonly removeActiveBuild: (build: string) => Awaitable<BuildCompletion>;
  /** Atomic submission boundary: external preparation is never a claimable partial Build. */
  readonly submissionStore: import("./submission.js").PendingBuildStore;
  readonly resourceStore: ResourceStore;
  /** Optional Build-local transient byte area used by Provider execution and Result writing. */
  readonly resourceStoreForBuild?: (build: string) => ResourceStore;
  /** Called only after a finished Build Result has accepted every retained Output completed so far. */
  readonly clearBuildResources?: (build: string) => Awaitable<void>;
  readonly openBuildResultRepository: (location: BuildResultRepositoryLocation) => Awaitable<BuildResultRepositoryOpened>;
  readonly credentialStore: CredentialStore;
  /** Deterministic implementations injected directly by an embedding. Installed packages arrive as facets. */
  readonly producers?: ProducerPackage;
  /** Type-owner validation rules injected directly by an embedding. */
  readonly refinements?: RefinementPackage;
  /** Load the complete physical package closure named by a claimed Build. */
  readonly loadProducerPackages?: (specifiers: readonly string[]) => Awaitable<readonly LoadedPackage[]>;
  readonly endpoints?: readonly EndpointInstance[];
  /** Which Endpoint instance serves each capability that several selected Endpoints offer. */
  readonly bindings?: Readonly<Record<string, string>>;
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeControlOptions = {
  readonly executionLogs?: import("./log.js").LocalExecutionLogs;
  readonly buildStore: BuildStore;
  readonly commandExecutionStore: import("@hypit/hypit/runtime").CommandExecutionStore;
  readonly openBuildResultRepository: (location: BuildResultRepositoryLocation) => Awaitable<BuildResultRepositoryOpened>;
  readonly operationStore: OperationStore;
  readonly executionStore: BuildExecutionStore;
  readonly submissionStore: import("./submission.js").PendingBuildStore;
  /** Optional owner supplied by the Runtime assembly. */
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalResultWriterOptions = {
  readonly executionLogs?: import("./log.js").LocalExecutionLogs;
  readonly buildStore: BuildStore;
  readonly operationStore: OperationStore;
  readonly commandExecutionStore: import("@hypit/hypit/runtime").CommandExecutionStore;
  readonly executionStore: BuildExecutionStore;
  readonly removeActiveBuild: (build: string) => Awaitable<BuildCompletion>;
  readonly submissionStore: import("./submission.js").PendingBuildStore;
  readonly resourceStore: ResourceStore;
  readonly resourceStoreForBuild?: (build: string) => ResourceStore;
  readonly clearBuildResources?: (build: string) => Awaitable<void>;
  readonly openBuildResultRepository: (location: BuildResultRepositoryLocation) => Awaitable<BuildResultRepositoryOpened>;
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalCredentialControlOptions = {
  readonly credentialStore: CredentialStore;
  readonly endpoints: readonly EndpointInstance[];
  readonly close?: () => Awaitable<void>;
};

export type LocalBuildRequest = Parameters<RuntimeHostExecution["build"]>[0];
export type LocalBuildOptions = Parameters<RuntimeHostExecution["build"]>[1];
export type LocalBuildSubmission = RuntimeHostBuildSubmission;

export type LocalRuntime = RuntimeHostExecution & {
  /** Advance owned or unstarted work only. Process lifecycle belongs to the Runtime Host. */
  workOnce(options?: { readonly build?: string; readonly hydrated?: () => void }): Promise<BuildExecutionSnapshot | BuildCompletion | undefined>;
};

/** Active execution control that never opens the selected ResourceStore. */
export type LocalRuntimeControl = RuntimeHostControl;

export type LocalResultWriter = {
  /** Incrementally accept retained Outputs already completed during execution. */
  sync(
    execution: BuildExecutionSnapshot,
    records: readonly import("@hypit/hypit/protocol").TypedRecord[],
  ): Promise<void>;
  /** Persist the outcome just frozen by the execution Worker, then remove active Runtime state. */
  completeResult(execution: BuildExecutionSnapshot): Promise<BuildExecutionSnapshot | BuildCompletion>;
  /** Roll back a submission that never became active. This is not a user Result operation. */
  discardSubmission(build: string): Promise<boolean>;
  close(): void | Promise<void>;
};

/** Credential control for one or more exact Endpoint declarations; no execution state is opened. */
export type LocalCredentialControl = RuntimeHostCredentialControl;
