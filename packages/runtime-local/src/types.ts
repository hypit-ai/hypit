import type { Awaitable, ComponentPackage } from "@hypit/component-kit";
import type { EndpointPackage } from "@hypit/endpoint-kit";
import type {
  ArtifactStore,
  BuildCatalog,
  BuildStore,
  BuildDispatchStore,
  BuildDispatchSnapshot,
  CredentialStore,
  OperationStore,
} from "@hypit/runtime";
import type {
  RuntimeHostArchive,
  RuntimeHostArtifactAccess,
  RuntimeHostBuildSubmission,
  RuntimeHostCredentialControl,
  RuntimeHostExecution,
} from "@hypit/runtime-host-node";

export type CreateLocalRuntimeOptions = {
  readonly buildStore: BuildStore;
  /** Host presentation metadata only; never part of Core state. */
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly dispatchStore: import("@hypit/runtime").BuildDispatchStore;
  readonly artifactStore: ArtifactStore;
  readonly credentialStore: CredentialStore;
  readonly components?: readonly ComponentPackage[];
  /** Load the component packages named by a claimed Build. */
  readonly loadComponentPackages?: (specifiers: readonly string[]) => Awaitable<readonly ComponentPackage[]>;
  readonly endpoints?: readonly EndpointPackage[];
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

export type CreateLocalCredentialControlOptions = {
  readonly credentialStore: CredentialStore;
  readonly endpoints: readonly EndpointPackage[];
  readonly close?: () => Awaitable<void>;
};

export type LocalBuildRequest = Parameters<RuntimeHostExecution["build"]>[0];
export type LocalBuildOptions = Parameters<RuntimeHostExecution["build"]>[1];
export type LocalBuildSubmission = RuntimeHostBuildSubmission;

export type LocalRuntime = RuntimeHostExecution & {
  workOnce(): Promise<BuildDispatchSnapshot | undefined>;
};

/** Durable execution-state archive that never opens the selected ArtifactStore. */
export type LocalRuntimeArchiveControl = RuntimeHostArchive;

/** Explicit Artifact byte access that never opens Build, Operation or Dispatch state. */
export type LocalRuntimeArtifactAccess = RuntimeHostArtifactAccess;

/** Credential control for one or more exact Endpoint declarations; no execution state is opened. */
export type LocalCredentialControl = RuntimeHostCredentialControl;
