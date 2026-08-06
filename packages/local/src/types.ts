import type { Awaitable, ComponentPackage } from "@svml/component-kit";
import type { ArtifactAttachment } from "@svml/host";
import type { NodeProviderPackage } from "@svml/provider-kit";
import type { BuildState } from "@svml/protocol";
import type {
  ArtifactStore,
  BuildSnapshot,
  BuildStore,
  CredentialStore,
  LocalBuildSchedulerOptions,
  OperationStore,
  OperationSnapshot,
  RuntimeModuleManifest,
  RuntimeModuleRegistry,
  RuntimeProfileInstance,
  RuntimeProviderBinding,
  ScheduledBuildResult,
} from "@svml/runtime";
import type { TypeValidatorRegistrar, TypeValidatorRegistryLike } from "@svml/validation";

/** @deprecated Use the host-neutral ComponentPackage name. */
export type NodeComponentPackage = ComponentPackage;
export type { ComponentPackage } from "@svml/component-kit";

export type LocalTypeValidatorRegistry = TypeValidatorRegistryLike & TypeValidatorRegistrar;

/** One configured ArtifactStore service selected by trusted deployment code. */
export type NodeArtifactStorePackage = {
  readonly name: string;
  readonly manifest: RuntimeModuleManifest;
  readonly instance: RuntimeProfileInstance;
  readonly store: ArtifactStore;
};

export type { NodeProviderPackage } from "@svml/provider-kit";

export type LocalRuntimeClosureOptions = {
  readonly modules: RuntimeModuleRegistry;
  readonly value: import("@svml/runtime").RuntimeClosure;
  readonly allowedPermissions?: readonly string[];
};

export type CreateLocalRuntimeOptions = {
  readonly buildStore: BuildStore;
  readonly operationStore?: OperationStore;
  readonly artifactStore: ArtifactStore;
  readonly credentialStore?: CredentialStore;
  readonly components?: readonly ComponentPackage[];
  readonly providers?: readonly NodeProviderPackage[];
  readonly closure?: LocalRuntimeClosureOptions;
  readonly scheduling?: Omit<LocalBuildSchedulerOptions, "buildStore" | "runtimeClosure">;
  readonly validators?: LocalTypeValidatorRegistry;
  /** Expected implementation package closure already bound into BuildRequest. */
  readonly implementationClosure?: import("@svml/protocol").Digest;
};

export type ProjectLocalRuntimeOptions = {
  /** Project directory containing the private .svml Runtime directory. Defaults to cwd. */
  readonly root?: string;
  readonly statePath?: string;
  readonly artifactPath?: string;
  /** Exact installed implementation package lock. Source imports cannot change this selection. */
  readonly packageLock?: string;
  /** Replaces the default project filesystem ArtifactStore without changing Scheduler/Core. */
  readonly artifacts?: NodeArtifactStorePackage;
  readonly components?: readonly ComponentPackage[];
  readonly providers?: readonly NodeProviderPackage[];
  readonly allowedPermissions?: readonly string[];
  readonly scheduling?: {
    readonly maxConcurrency?: number;
    readonly lanes?: Readonly<Record<string, number>>;
    readonly maxEventsPerBuild?: number;
  };
  readonly validators?: LocalTypeValidatorRegistry;
};

export type LocalBuildRequest = {
  /** Stable user/run identity. Reusing it resumes only the same Core Build identity. */
  readonly id: string;
  readonly state: BuildState;
  /** Host transfer bundle. It is staged before Core commands run and never enters BuildState. */
  readonly attachments?: readonly ArtifactAttachment[];
};

export type LocalBuildOptions = {
  /** Keep resuming pending Operations according to wakeAt until completion, pause, abort or deadline. */
  readonly follow?: boolean;
  readonly pollIntervalMs?: number;
  readonly maxWaitMs?: number;
  readonly signal?: AbortSignal;
};

export type LocalRuntimeStatus = {
  readonly build: BuildSnapshot | undefined;
  readonly operations: readonly OperationSnapshot[];
};

export type LocalRuntime = {
  build(request: LocalBuildRequest, options?: LocalBuildOptions): Promise<ScheduledBuildResult>;
  buildMany(requests: readonly LocalBuildRequest[]): Promise<readonly ScheduledBuildResult[]>;
  status(build: string): Promise<LocalRuntimeStatus>;
  cancel(build: string): Promise<ScheduledBuildResult | undefined>;
  close(): Awaitable<void>;
};
