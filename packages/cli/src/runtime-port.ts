import type { ArtifactAttachment } from "@narratage/workspace";
import type { BuildState, Digest } from "@narratage/protocol";
import type {
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildDispatchSnapshot,
  BuildSnapshot,
  CapacityReservation,
  CredentialRef,
  OperationSnapshot,
  RuntimeWorkerRunOptions,
} from "@narratage/runtime";

export type CliBuildSubmission = {
  readonly id: string;
  readonly state: BuildState;
  readonly status: "queued" | "running" | "waiting" | "blocked" | "settling" | "complete" | "failed" | "cancelled";
  readonly dispatch: BuildDispatchSnapshot;
};

export type CliRuntimeStatus = {
  readonly build: BuildSnapshot | undefined;
  readonly catalog: BuildCatalogEntry | undefined;
  readonly operations: readonly OperationSnapshot[];
  readonly dispatch: BuildDispatchSnapshot | undefined;
};

export type CliCredentialStatus = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly kind: "secret" | "json";
  readonly ref: CredentialRef;
  readonly configured: boolean;
  readonly writable: boolean;
};

export type CliArtifactGarbageCollection = {
  readonly reachable: readonly Digest[];
  readonly unreachable: readonly Digest[];
  readonly deleted: readonly Digest[];
};

export type CliRuntimeArchiveControl = {
  status(build: string): Promise<CliRuntimeStatus>;
  activity(build: string): Promise<{
    readonly operations: readonly OperationSnapshot[];
    readonly dispatch: BuildDispatchSnapshot | undefined;
  }>;
  queue(): Promise<{
    readonly dispatches: readonly BuildDispatchSnapshot[];
    readonly capacity: readonly CapacityReservation[];
    readonly operations: readonly OperationSnapshot[];
  }>;
  operation(id: Digest): Promise<OperationSnapshot | undefined>;
  builds(): Promise<readonly BuildCatalogEntry[]>;
  cancel(build: string, reason?: string): Promise<BuildDispatchSnapshot | undefined>;
  cancelOperation(id: Digest, reason?: string): Promise<OperationSnapshot | undefined>;
  close(): void | Promise<void>;
};

export type CliRuntimeArtifactAccess = {
  readArtifact(digest: Digest): Promise<Uint8Array | undefined>;
  openArtifact(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined>;
  close(): void | Promise<void>;
};

export type CliRuntimeMaintenance = CliRuntimeArchiveControl & CliRuntimeArtifactAccess & {
  garbageCollectArtifacts(options?: { readonly apply?: boolean }): Promise<CliArtifactGarbageCollection>;
};

export type CliCredentialControl = {
  credentials(endpoint?: string): Promise<readonly CliCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<CliCredentialStatus>;
  deleteCredential(endpoint: string, slot: string): Promise<{
    readonly deleted: boolean;
    readonly credential: CliCredentialStatus;
  }>;
  close(): void | Promise<void>;
};

export type CliRuntime = CliRuntimeMaintenance & CliCredentialControl & {
  build(request: {
    readonly id: string;
    readonly state: BuildState;
    readonly catalog?: BuildCatalogDescriptor;
    readonly attachments?: readonly ArtifactAttachment[];
  }, options?: {
    readonly follow?: boolean;
    readonly pollIntervalMs?: number;
    readonly maxWaitMs?: number;
    readonly signal?: AbortSignal;
  }): Promise<CliBuildSubmission>;
  work(options: RuntimeWorkerRunOptions): Promise<void>;
};

export type CliRuntimeDoctorDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type CliRuntimeDoctorResult = {
  readonly root: string;
  readonly diagnostics: readonly CliRuntimeDoctorDiagnostic[];
};

export type CliExternalServiceProgress = {
  readonly id: string;
  readonly phase: "checking" | "preparing" | "starting" | "waiting" | "ready";
};

export type CliExternalServiceReport = {
  readonly id: string;
  readonly instances: readonly string[];
  readonly action?: "already-running" | "prepared" | "started" | "stopped" | "not-ours" | "nothing-to-stop" | "unchanged";
  readonly state:
    | { readonly state: "ready" }
    | { readonly state: "down"; readonly detail: string }
    | { readonly state: "mismatch"; readonly detail: string };
  readonly detail?: string;
  readonly logPath?: string;
  readonly pid?: number;
};
