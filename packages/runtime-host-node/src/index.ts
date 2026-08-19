import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import type { ArtifactAttachment } from "@hypit/workspace";
import type { BuildDefinition, BuildState, CapabilityRef, Digest } from "@hypit/protocol";
import type {
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildDispatchSnapshot,
  BuildSnapshot,
  CapacityReservation,
  CredentialRef,
  OperationSnapshot,
  RuntimeWorkerRunOptions,
} from "@hypit/runtime";
import type { RuntimeDoctorDiagnostic } from "@hypit/runtime-kit";

export type RuntimeHostBuildSubmission = {
  readonly id: string;
  readonly state: BuildState;
  readonly status: "queued" | "running" | "waiting" | "complete" | "failed" | "cancelled";
  readonly dispatch: BuildDispatchSnapshot;
};

export type RuntimeHostStatus = {
  readonly build: BuildSnapshot | undefined;
  readonly catalog: BuildCatalogEntry | undefined;
  readonly operations: readonly OperationSnapshot[];
  readonly dispatch: BuildDispatchSnapshot | undefined;
};

export type RuntimeHostCredentialStatus = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly kind: "secret" | "json";
  readonly ref: CredentialRef;
  readonly configured: boolean;
  readonly writable: boolean;
};

export type RuntimeHostArchive = {
  status(build: string): Promise<RuntimeHostStatus>;
  activity(build: string): Promise<{
    readonly operations: readonly OperationSnapshot[];
    readonly dispatch: BuildDispatchSnapshot | undefined;
  }>;
  queue(): Promise<{
    readonly dispatches: readonly BuildDispatchSnapshot[];
    readonly capacity: readonly CapacityReservation[];
    readonly operations: readonly OperationSnapshot[];
  }>;
  builds(): Promise<readonly BuildCatalogEntry[]>;
  cancel(build: string, reason?: string): Promise<BuildDispatchSnapshot | undefined>;
  close(): void | Promise<void>;
};

export type RuntimeHostArtifactAccess = {
  readArtifact(digest: Digest): Promise<Uint8Array | undefined>;
  openArtifact(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined>;
  close(): void | Promise<void>;
};

export type RuntimeHostCredentialControl = {
  credentials(endpoint?: string): Promise<readonly RuntimeHostCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<RuntimeHostCredentialStatus>;
  deleteCredential(endpoint: string, slot: string): Promise<{
    readonly deleted: boolean;
    readonly credential: RuntimeHostCredentialStatus;
  }>;
  close(): void | Promise<void>;
};

export type RuntimeHostExecution = RuntimeHostArchive & RuntimeHostArtifactAccess & RuntimeHostCredentialControl & {
  build(request: {
    readonly id: string;
    readonly definition: BuildDefinition;
    readonly componentPackages?: readonly string[];
    readonly catalog?: BuildCatalogDescriptor;
    readonly attachments?: readonly ArtifactAttachment[];
  }, options?: {
    readonly follow?: boolean;
    readonly pollIntervalMs?: number;
    readonly maxWaitMs?: number;
    readonly signal?: AbortSignal;
  }): Promise<RuntimeHostBuildSubmission>;
  work(options: RuntimeWorkerRunOptions): Promise<void>;
};

export type RuntimeHostDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

export type ManagedProgramProgress = {
  readonly id: string;
  readonly phase: "checking" | "preparing" | "starting" | "waiting" | "ready";
};

export type ManagedProgramReport = {
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

export type RuntimeWorkerState = {
  readonly state: "running" | "stopped";
  readonly profile: string;
  readonly pid?: number;
  readonly startedAt?: number;
  readonly logPath: string;
};

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
    up(options: {
      readonly maxWaitMs?: number;
      readonly onProgress?: (event: ManagedProgramProgress) => void;
      readonly capabilities?: readonly CapabilityRef[];
    }): Promise<{ readonly dataRoot: string; readonly programs: readonly ManagedProgramReport[] }>;
    down(): Promise<{ readonly dataRoot: string; readonly programs: readonly ManagedProgramReport[] }>;
    report(): Promise<{ readonly dataRoot: string; readonly programs: readonly ManagedProgramReport[] }>;
  };
};

export type RuntimeWorkerLaunch = {
  readonly command: string;
  readonly args: readonly string[];
};

export type NodeRuntimeHost = {
  readonly profile: string;
  resolvePaths(): Promise<{
    readonly packageRoot?: string;
    readonly runtimeDataRoot?: string;
  }>;
  controller(options?: {
    readonly packageRoot?: string;
  }): Promise<RuntimeController>;
  createRuntime(): Promise<RuntimeHostExecution>;
  openArchive(options?: { readonly readOnly?: boolean }): Promise<RuntimeHostArchive>;
  openArtifacts(): Promise<RuntimeHostArtifactAccess>;
  openCredentials(endpoint: string): Promise<RuntimeHostCredentialControl>;
  doctor(options?: {
    readonly capabilities?: readonly CapabilityRef[];
  }): Promise<RuntimeHostDoctorResult>;
  runWorker(readyFile: string): Promise<void>;
};

function pathLike(value: string): boolean {
  return isAbsolute(value) || value.includes("/") || value.includes("\\");
}

/** Bare command names remain PATH-resolved; configured relative paths are rooted at the Runtime Profile root. */
export function resolveRuntimeExecutable(root: string, value: string): string {
  return pathLike(value) && !isAbsolute(value) ? resolve(root, value) : value;
}

async function executableExists(value: string): Promise<boolean> {
  const unavailable = (error: unknown) => error instanceof Error && "code" in error
    && ["ENOENT", "ENOTDIR", "EACCES"].includes(String(error.code));
  if (pathLike(value)) {
    try {
      await access(value, constants.X_OK);
      return true;
    } catch (error) {
      if (unavailable(error)) return false;
      throw error;
    }
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    try {
      await access(resolve(directory, value), constants.X_OK);
      return true;
    } catch (error) {
      if (!unavailable(error)) throw error;
    }
  }
  return false;
}

export async function diagnoseRuntimeExecutable(options: {
  readonly root: string;
  readonly configured: string | undefined;
  readonly fallback: string;
  readonly subject: string;
}): Promise<readonly RuntimeDoctorDiagnostic[]> {
  const value = resolveRuntimeExecutable(options.root, options.configured ?? options.fallback);
  return await executableExists(value) ? [] : [{
    severity: "error",
    code: "RUNTIME_EXECUTABLE_MISSING",
    message: `${options.subject} executable ${value} is unavailable`,
    subject: value,
  }];
}

export function diagnoseRuntimeEnvironmentCredential(
  variable: string,
  subject: string,
): readonly RuntimeDoctorDiagnostic[] {
  return process.env[variable]?.trim()
    ? []
    : [{
      severity: "error",
      code: "RUNTIME_CREDENTIAL_MISSING",
      message: `${subject} requires environment variable ${variable}`,
      subject: variable,
    }];
}
