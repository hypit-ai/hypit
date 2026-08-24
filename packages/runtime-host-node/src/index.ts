import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
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
  readonly phase: "checking" | "installing" | "starting" | "waiting" | "ready";
};

export type ManagedProgramReport = {
  readonly id: string;
  readonly instances: readonly string[];
  readonly action?: "already-running" | "installed" | "started" | "stopped" | "not-ours" | "nothing-to-stop" | "unchanged";
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
  /** Explicitly prepare upstream packages selected by this Runtime Profile. */
  prepare(options?: {
    readonly onProgress?: (event: import("./packages.js").HostPackageProgress) => void;
  }): Promise<readonly import("./packages.js").HostPackageReport[]>;
  /**
   * Read-only, bounded deployment validation for one demanded Build slice.
   * It may inspect local files, credentials and loopback program state, but it
   * never installs, starts or contacts a remote Provider or Artifact Store.
   */
  preflight(options?: {
    readonly capabilities?: readonly CapabilityRef[];
  }): Promise<RuntimeHostDoctorResult>;
  /** Active deployment diagnosis. Unlike preflight, adapters may contact their configured services. */
  doctor(options?: {
    readonly capabilities?: readonly CapabilityRef[];
  }): Promise<RuntimeHostDoctorResult>;
  runWorker(readyFile: string): Promise<void>;
};

/**
 * Persistent state owned by the installed Hypit Host, never by an author project
 * or a replaceable source checkout.
 */
export function hypitHostStateRoot(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
} = {}): string {
  const env = options.env ?? process.env;
  const override = env.HYPIT_STATE_HOME;
  if (override !== undefined && override.trim().length > 0) return resolve(override);
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  if (platform === "darwin") return join(home, "Library", "Application Support", "Hypit");
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    return join(local === undefined || local.trim().length === 0
      ? join(home, "AppData", "Local")
      : local, "Hypit");
  }
  const state = env.XDG_STATE_HOME;
  return join(state === undefined || state.trim().length === 0
    ? join(home, ".local", "state")
    : state, "hypit");
}

/** Upstream npm packages shared by every Hypit project and future session on this machine. */
export function hypitHostPackageRoot(hostStateRoot = hypitHostStateRoot()): string {
  return join(resolve(hostStateRoot), "packages");
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
  const extensions = process.platform === "win32" && !/\.[^\\/]+$/u.test(value)
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [];
  // A configured path names one file, and on Windows this asks only whether that file is there, so
  // it is tried as written before any PATHEXT extension. A bare command name is resolved the way a
  // shell would resolve it, where an extensionless entry is not something Windows can run.
  const candidates = (base: string, suffixes: readonly string[]) =>
    (suffixes.length === 0 ? [""] : suffixes).map((suffix) => `${base}${suffix}`);
  const available = async (candidate: string): Promise<boolean> => {
    try {
      await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return true;
    } catch (error) {
      if (unavailable(error)) return false;
      throw error;
    }
  };
  if (pathLike(value)) {
    for (const candidate of candidates(value, ["", ...extensions])) if (await available(candidate)) return true;
    return false;
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const candidate of candidates(resolve(directory, value), extensions)) {
      if (await available(candidate)) return true;
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

/** Executables inside a Python virtual environment have one platform-defined layout. */
export function pythonEnvironmentExecutable(environment: string): string {
  return process.platform === "win32"
    ? resolve(environment, "Scripts", "python.exe")
    : resolve(environment, "bin", "python");
}

/** Console scripts installed by Python use an executable shim on Windows. */
export function pythonEnvironmentCommand(environment: string, name: string): string {
  return process.platform === "win32"
    ? resolve(environment, "Scripts", `${name}.exe`)
    : resolve(environment, "bin", name);
}

export {
  inspectHostPackage,
  parseRegistryPackageSpec,
  prepareHostPackages,
} from "./packages.js";
export type {
  HostPackageProgress,
  HostPackageReport,
  RegistryPackageSpec,
} from "./packages.js";
