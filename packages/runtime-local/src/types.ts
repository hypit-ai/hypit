import type { Awaitable, ComponentPackage } from "@hypit/component-kit";
import type { EndpointPackage } from "@hypit/endpoint-kit";
import type { LoadedComponentPackage } from "@hypit/package-loader-node";
import type { BuildResultRepositoryLocation, BuildResultRepositoryOpened } from "@hypit/build-result-kit";
import type {
  ResourceStore,
  BuildCompletion,
  BuildCatalog,
  BuildStore,
  BuildExecutionStore,
  BuildExecutionSnapshot,
  CredentialStore,
  OperationStore,
} from "@hypit/runtime";
import type {
  RuntimeHostControl,
  RuntimeHostBuildSubmission,
  RuntimeHostCredentialControl,
  RuntimeHostExecution,
  RuntimeHostResultControl,
} from "@hypit/runtime-host-node";

export type CreateLocalRuntimeOptions = {
  readonly buildStore: BuildStore;
  /** Host presentation metadata only; never part of Core state. */
  readonly buildCatalog: BuildCatalog;
  readonly operationStore: OperationStore;
  /** Durable receipt boundary: one immediate Command is never invoked twice for one Build. */
  readonly commandExecutionStore: import("@hypit/runtime").CommandExecutionStore;
  readonly assertEnvironment?: () => Awaitable<void>;
  readonly executionStore: import("@hypit/runtime").BuildExecutionStore;
  readonly removeActiveBuild: (build: string) => Awaitable<BuildCompletion>;
  /** Atomic submission boundary: external preparation is never a claimable partial Build. */
  readonly submissionStore: import("@hypit/runtime").PendingBuildStore;
  readonly resourceStore: ResourceStore;
  /** Optional Build-local transient byte area used by Provider execution and Result writing. */
  readonly resourceStoreForBuild?: (build: string) => ResourceStore;
  /** Called only after a finished Build Result has accepted every public Output completed so far. */
  readonly clearBuildResources?: (build: string) => Awaitable<void>;
  readonly openBuildResultRepository: (location: BuildResultRepositoryLocation) => Awaitable<BuildResultRepositoryOpened>;
  readonly credentialStore: CredentialStore;
  readonly components?: readonly ComponentPackage[];
  /** Load the complete physical package closure named by a claimed Build. */
  readonly loadComponentPackages?: (specifiers: readonly string[]) => Awaitable<readonly LoadedComponentPackage[]>;
  readonly endpoints?: readonly EndpointPackage[];
  /** Which Endpoint instance serves each capability that several selected Endpoints offer. */
  readonly bindings?: Readonly<Record<string, string>>;
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeControlOptions = {
  readonly buildStore: BuildStore;
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly executionStore: BuildExecutionStore;
  readonly submissionStore: import("@hypit/runtime").PendingBuildStore;
  /** Optional owner supplied by the Runtime assembly. */
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalResultWriterOptions = {
  readonly buildStore: BuildStore;
  readonly operationStore: OperationStore;
  readonly commandExecutionStore: import("@hypit/runtime").CommandExecutionStore;
  readonly executionStore: BuildExecutionStore;
  readonly removeActiveBuild: (build: string) => Awaitable<BuildCompletion>;
  readonly submissionStore: import("@hypit/runtime").PendingBuildStore;
  readonly resourceStore: ResourceStore;
  readonly resourceStoreForBuild?: (build: string) => ResourceStore;
  readonly clearBuildResources?: (build: string) => Awaitable<void>;
  readonly openBuildResultRepository: (location: BuildResultRepositoryLocation) => Awaitable<BuildResultRepositoryOpened>;
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalCredentialControlOptions = {
  readonly credentialStore: CredentialStore;
  readonly endpoints: readonly EndpointPackage[];
  readonly close?: () => Awaitable<void>;
};

export type LocalBuildRequest = Parameters<RuntimeHostExecution["build"]>[0];
export type LocalBuildOptions = Parameters<RuntimeHostExecution["build"]>[1];
export type LocalBuildSubmission = RuntimeHostBuildSubmission;

export type LocalRuntime = RuntimeHostExecution & {
  workOnce(): Promise<BuildExecutionSnapshot | BuildCompletion | undefined>;
};

/** Active execution control that never opens the selected ResourceStore. */
export type LocalRuntimeControl = RuntimeHostControl;

export type LocalResultWriter = RuntimeHostResultControl & {
  /** Incrementally accept public Outputs already completed during execution. */
  sync(execution: BuildExecutionSnapshot, state: import("@hypit/protocol").BuildState): Promise<void>;
  /** Persist the outcome just frozen by the execution Worker, then remove active Runtime state. */
  completeResult(execution: BuildExecutionSnapshot): Promise<BuildExecutionSnapshot | BuildCompletion>;
};

/** Credential control for one or more exact Endpoint declarations; no execution state is opened. */
export type LocalCredentialControl = RuntimeHostCredentialControl;
