import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";

import type { HostFacet } from "@narratage/host";
import {
  loadNodePackageSelection,
} from "@narratage/package-loader-node";
import type { LoadedPackage } from "@narratage/package-loader-node";
import type { ArtifactAttachment } from "@narratage/workspace";
import type { BuildDefinition, BuildState, CanonicalValue, CapabilityRef, Digest } from "@narratage/protocol";
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
import type { RuntimeDoctorDiagnostic } from "@narratage/runtime-kit";

export const nodeRuntimeHostAdapterAbi = "narratage.node-runtime-host-adapter@1";

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

export type RuntimeHostArtifactGarbageCollection = {
  readonly reachable: readonly Digest[];
  readonly unreachable: readonly Digest[];
  readonly deleted: readonly Digest[];
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

export type RuntimeHostMaintenance = RuntimeHostArchive & RuntimeHostArtifactAccess & {
  garbageCollectArtifacts(options?: { readonly apply?: boolean }): Promise<RuntimeHostArtifactGarbageCollection>;
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

export type RuntimeHostExecution = RuntimeHostMaintenance & RuntimeHostCredentialControl & {
  build(request: {
    readonly id: string;
    readonly definition: BuildDefinition;
    readonly implementationPackages?: readonly string[];
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
    readonly workspaceRoot?: string;
    readonly implementationPackages?: readonly string[];
    readonly packageRoot?: string;
  }): Promise<RuntimeController>;
  createRuntime(options?: { readonly implementationPackages?: readonly LoadedPackage[] }): Promise<RuntimeHostExecution>;
  openArchive(options?: { readonly readOnly?: boolean }): Promise<RuntimeHostArchive>;
  openArtifacts(options?: { readonly readOnly?: boolean }): Promise<RuntimeHostArtifactAccess>;
  openMaintenance(options?: { readonly readOnly?: boolean }): Promise<RuntimeHostMaintenance>;
  openCredentials(endpoint: string): Promise<RuntimeHostCredentialControl>;
  doctor(options?: {
    readonly capabilities?: readonly CapabilityRef[];
    readonly implementationPackages?: readonly LoadedPackage[];
  }): Promise<RuntimeHostDoctorResult>;
  runWorker(readyFile: string, options?: {
    readonly implementationPackages?: readonly LoadedPackage[];
  }): Promise<void>;
};

export type NodeRuntimeHostAdapterContext = {
  readonly profile: string;
  readonly profileRoot: string;
  readonly packageRoot: string;
  readonly config: CanonicalValue;
  readonly workerLaunch: RuntimeWorkerLaunch;
};

export type NodeRuntimeHostAdapterFacet = HostFacet & {
  readonly abi: typeof nodeRuntimeHostAdapterAbi;
  readonly offers: readonly [string];
  readonly implementation: {
    open(context: NodeRuntimeHostAdapterContext): NodeRuntimeHost | Promise<NodeRuntimeHost>;
  };
};

function nonEmpty(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

export function createNodeRuntimeHostAdapterFacet(options: {
  readonly use: string;
  readonly open: NodeRuntimeHostAdapterFacet["implementation"]["open"];
}): NodeRuntimeHostAdapterFacet {
  return {
    abi: nodeRuntimeHostAdapterAbi,
    offers: [nonEmpty(options.use, "Runtime Host Adapter use")],
    implementation: { open: options.open },
  };
}

export async function loadNodeRuntimeHost(
  path: string,
  options: { readonly packageRoot: string; readonly workerLaunch: RuntimeWorkerLaunch },
): Promise<NodeRuntimeHost> {
  const profile = resolve(path);
  const profileRoot = dirname(profile);
  const value = JSON.parse(await readFile(profile, "utf8")) as Record<string, unknown>;
  if (value.format !== "narratage.runtime-profile@1") {
    throw new Error("Runtime Profile format must be narratage.runtime-profile@1");
  }
  const runtime = value.runtime;
  if (runtime === null || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new Error("Runtime Profile runtime must be an object");
  }
  const record = runtime as Record<string, unknown>;
  const use = nonEmpty(record.use, "Runtime Profile runtime.use");
  const config = (record.config ?? {}) as CanonicalValue;
  const loaded = await loadNodePackageSelection({
    selected: [],
    logical: [{ abi: nodeRuntimeHostAdapterAbi, name: use }],
  }, options.packageRoot);
  const matches = loaded.flatMap((item) => item.contribution.hostFacets ?? [])
    .filter((facet): facet is NodeRuntimeHostAdapterFacet => facet.abi === nodeRuntimeHostAdapterAbi
      && facet.offers?.includes(use) === true);
  if (matches.length !== 1) throw new Error(`Runtime Host Adapter ${use} must have exactly one implementation`);
  const implementation = matches[0]!.implementation;
  if (implementation === null || typeof implementation !== "object"
    || typeof (implementation as { readonly open?: unknown }).open !== "function") {
    throw new Error(`Runtime Host Adapter ${use} does not implement open()`);
  }
  return await implementation.open({
    profile,
    profileRoot,
    packageRoot: resolve(options.packageRoot),
    config,
    workerLaunch: options.workerLaunch,
  });
}

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
