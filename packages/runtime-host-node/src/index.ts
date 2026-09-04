import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import type { ArtifactAttachment } from "@hypit/workspace";
import type { BuildResultForward } from "@hypit/build-result";
import type { BuildResultRepositoryLocation } from "@hypit/build-result-kit";
import type { DriverRunResult, NodeDriverOptions, ProducerRegistry } from "@hypit/driver-node";
import type { BuildDefinition, BuildState, CapabilityRef, Need, StoredValue } from "@hypit/protocol";
import type {
  BuildCatalogDescriptor,
  BuildCompletion,
  CapacityReservation,
  CredentialAcquisition,
  CredentialRef,
  OperationSnapshot,
  ResourceStore,
  RuntimeWorkerRunOptions,
} from "@hypit/runtime";
import type { RuntimeDoctorDiagnostic } from "@hypit/runtime-kit";

export type RuntimeHostActiveBuildSubmission = {
  readonly id: string;
  readonly state: BuildState;
  readonly view: BuildView;
};

export type RuntimeHostFinishedBuildSubmission = {
  readonly id: string;
  readonly state: BuildState;
  readonly completion: BuildCompletion;
};

export type RuntimeHostBuildSubmission = RuntimeHostActiveBuildSubmission | RuntimeHostFinishedBuildSubmission;

export type BuildActivity = "submitting" | "ready" | "running" | "waiting" | "saving-result";

export type BuildOperationView = {
  readonly endpoint: string;
  readonly status: OperationSnapshot["status"];
  readonly progress?: OperationSnapshot["progress"];
  readonly failure?: OperationSnapshot["failure"];
};

/** Stable Host view. Runtime persistence records never cross this boundary. */
export type BuildView = {
  readonly id: string;
  readonly createdAt: number;
  readonly activity: BuildActivity;
  readonly outcome?: BuildCompletion["outcome"];
  readonly issue?: { readonly scope: "result" | "cleanup"; readonly message: string };
  readonly cancellationRequested: boolean;
  readonly source?: { readonly path: string };
  readonly run?: { readonly path: string };
  readonly targets: readonly string[];
  /** External Needs in the frozen Build Plan and the subset already accepted by Core. */
  readonly requests?: { readonly total: number; readonly completed: number };
  readonly acceptedRecords: number;
  readonly outstandingCommands: number;
  readonly operations: readonly BuildOperationView[];
};

export type RuntimeHostCredentialStatus = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly kind: "secret" | "json";
  readonly ref: CredentialRef;
  readonly acquisition?: CredentialAcquisition;
  readonly configured: boolean;
  readonly writable: boolean;
};

export type RuntimeHostControl = {
  inspect(build: string): Promise<BuildView | undefined>;
  activity(): Promise<{
    readonly builds: readonly BuildView[];
    readonly capacity: readonly CapacityReservation[];
  }>;
  cancel(build: string, reason?: string): Promise<BuildView | undefined>;
  close(): void | Promise<void>;
};

/** One-shot Result write or incomplete-submission cleanup with no execution Providers. */
export type RuntimeHostResultControl = {
  finishResult(build: string): Promise<{
    readonly id: string;
    readonly outcome: BuildCompletion["outcome"];
    readonly issue?: { readonly scope: "result" | "cleanup"; readonly message: string };
  } | undefined>;
  discardSubmission(build: string): Promise<boolean>;
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

export type RuntimeHostExecution = RuntimeHostControl & RuntimeHostCredentialControl & RuntimeHostResultControl & {
  build(request: {
    readonly id: string;
    readonly definition: BuildDefinition;
    readonly componentPackages?: readonly string[];
    readonly catalog: BuildCatalogDescriptor;
    readonly attachments?: readonly ArtifactAttachment[];
    /** Project-owned Result destination, fixed before this Build becomes active. */
    readonly result: {
      readonly repository: BuildResultRepositoryLocation;
      readonly title?: string;
      readonly forwards?: readonly BuildResultForward[];
    };
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

/**
 * Disposable graph evaluation through capabilities that their Providers explicitly allow outside
 * a Build. The Host owns Endpoint selection, credentials, invocation and session-local concurrency;
 * callers contribute only deterministic domain Producers, validation and an ephemeral ResourceStore.
 */
export type RuntimeHostTransientExecution = {
  evaluate(input: {
    readonly state: BuildState;
    readonly producers: ProducerRegistry;
    readonly validators: NonNullable<NodeDriverOptions["validators"]>;
    readonly resources: ResourceStore;
  }): Promise<DriverRunResult>;
  close(): void | Promise<void>;
};

/** The selected Endpoint behind one demanded capability, read from the Profile alone. */
export type RuntimeHostCapabilityProvider = {
  /** Caller-owned identity for this planned request. */
  readonly request: string;
  readonly capability: CapabilityRef;
  readonly status: "resolved" | "unresolved" | "ambiguous";
  /** Configured Endpoint instance that would serve the capability, when exactly one does. */
  readonly endpoint?: string;
  /** Provider package the Runtime Profile selected for that Endpoint. */
  readonly use?: string;
  /** Where that Provider publishes its prices, as the Provider package declares it. */
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  /** Every matching Endpoint instance when the selection is ambiguous. */
  readonly endpoints?: readonly string[];
  /** The Endpoint instance the Profile's `bindings` name for this capability, when it names one. */
  readonly binding?: string;
};

export type RuntimeHostProviderQuery = {
  readonly request: string;
  readonly capability: CapabilityRef;
  readonly returns: import("@hypit/protocol").TypeRef;
  /** Complete support-relevant parameters available before the Build. */
  readonly constraints: import("@hypit/protocol").CanonicalValue;
  /** Future graph inputs described by the package that owns this request. */
  readonly pendingInputs?: readonly {
    readonly input: string;
    readonly role?: string;
  }[];
};

export type ManagedProgramProgress = {
  readonly id: string;
  readonly phase: "checking" | "installing" | "starting" | "waiting" | "ready";
};

export type ManagedProgramReport = {
  readonly id: string;
  readonly endpoint: string;
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
  readonly configuration?: "current" | "changed";
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
  openControl(options?: { readonly readOnly?: boolean }): Promise<RuntimeHostControl>;
  /** Open only Result-writing dependencies; never construct execution Providers. */
  openResultControl(): Promise<RuntimeHostResultControl>;
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
  /**
   * Which selected Endpoint would serve each capability and where its Provider publishes prices.
   * Reads the Profile and Endpoint declarations only; never resolves a credential or contacts a service.
   */
  providers(requests: readonly RuntimeHostProviderQuery[]): Promise<readonly RuntimeHostCapabilityProvider[]>;
  /**
   * Execute one immediate Need through the selected Endpoint and its credentials, outside any Build.
   * The creation-time boundary for observation, transcription and other quick capabilities; it
   * creates no Build, Result or state, and refuses asynchronous capabilities.
   */
  invoke(need: Need, resources: ResourceStore): Promise<{ readonly value: StoredValue }>;
  /** Open one disposable authoring execution. It creates no Build, Result or recoverable Operation. */
  openTransientExecution(): Promise<RuntimeHostTransientExecution>;
  runWorker(readyFile: string, owner: string): Promise<void>;
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
