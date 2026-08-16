import type { Awaitable, ComponentPackage } from "@narratage/component-kit";
import type { EndpointPackage } from "@narratage/endpoint-kit";
import type {
  ArtifactStore,
  BuildCatalog,
  BuildSchedulerOptions,
  BuildStore,
  BuildDispatchStore,
  BuildDispatchSnapshot,
  CredentialStore,
  OperationStore,
} from "@narratage/runtime";
import type {
  RuntimeHostArchive,
  RuntimeHostArtifactAccess,
  RuntimeHostArtifactGarbageCollection,
  RuntimeHostBuildSubmission,
  RuntimeHostCredentialControl,
  RuntimeHostCredentialStatus,
  RuntimeHostExecution,
  RuntimeHostMaintenance,
  RuntimeHostStatus,
} from "@narratage/runtime-host-node";
import type { TypeValidatorRegistrar, TypeValidatorRegistryLike } from "@narratage/validation";

export type { ComponentPackage } from "@narratage/component-kit";

export type LocalTypeValidatorRegistry = TypeValidatorRegistryLike & TypeValidatorRegistrar;

export type { EndpointPackage } from "@narratage/endpoint-kit";

export type CreateLocalRuntimeOptions = {
  readonly buildStore: BuildStore;
  /** Host presentation metadata only; never part of Core state. */
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly dispatchStore: import("@narratage/runtime").BuildDispatchStore;
  readonly artifactStore: ArtifactStore;
  readonly credentialStore: CredentialStore;
  readonly components?: readonly ComponentPackage[];
  /** Load the component packages named by a claimed Build. */
  readonly loadComponentPackages?: (specifiers: readonly string[]) => Awaitable<readonly ComponentPackage[]>;
  readonly endpoints?: readonly EndpointPackage[];
  readonly scheduling: Omit<BuildSchedulerOptions, "buildStore">;
  readonly validators?: LocalTypeValidatorRegistry;
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeArchiveControlOptions = {
  readonly buildStore: BuildStore;
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly dispatchStore: BuildDispatchStore;
  /** Optional owner supplied by the Runtime assembly. */
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeArtifactAccessOptions = {
  readonly artifactStore: ArtifactStore;
  /** Optional owner supplied by the Runtime assembly. */
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeControlOptions = CreateLocalRuntimeArchiveControlOptions
  & CreateLocalRuntimeArtifactAccessOptions;

export type CreateLocalCredentialControlOptions = {
  readonly credentialStore: CredentialStore;
  readonly endpoints: readonly EndpointPackage[];
  readonly close?: () => Awaitable<void>;
};

export type LocalBuildRequest = Parameters<RuntimeHostExecution["build"]>[0];
export type LocalBuildOptions = Parameters<RuntimeHostExecution["build"]>[1];
export type LocalBuildSubmission = RuntimeHostBuildSubmission;
export type LocalRuntimeStatus = RuntimeHostStatus;
export type LocalRuntimeActivity = Awaited<ReturnType<RuntimeHostArchive["activity"]>>;
export type LocalRuntimeQueue = Awaited<ReturnType<RuntimeHostArchive["queue"]>>;
export type LocalCredentialStatus = RuntimeHostCredentialStatus;
export type ArtifactGarbageCollection = RuntimeHostArtifactGarbageCollection;

export type LocalRuntime = RuntimeHostExecution & {
  workOnce(): Promise<BuildDispatchSnapshot | undefined>;
};

/** Durable execution-state archive that never opens the selected ArtifactStore. */
export type LocalRuntimeArchiveControl = RuntimeHostArchive;

/** Explicit Artifact byte access that never opens Build, Operation or Dispatch state. */
export type LocalRuntimeArtifactAccess = RuntimeHostArtifactAccess;

/** Durable project control used only when one operation truly spans state and Artifacts. */
export type LocalRuntimeControl = RuntimeHostMaintenance;

/** Credential control for one or more exact Endpoint declarations; no execution state is opened. */
export type LocalCredentialControl = RuntimeHostCredentialControl;
