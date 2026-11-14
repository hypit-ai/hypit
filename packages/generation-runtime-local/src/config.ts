import { fileExecutionLogs } from "./log.js";
import { constants } from "node:fs";
import { access, readFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  loadNodePackageSelection,
} from "@hypit/loader/node";
import { assertBuildId } from "@hypit/generation-build";
import type { CanonicalValue } from "@hypit/protocol";
import type { CapabilityRef } from "@hypit/module";
import { FileResourceStore } from "@hypit/resource-store/node";
import type { ProductHistory } from "@hypit/product";
import { FileProductHistory } from "@hypit/product/node";
import type { BuildResultHistory } from "@hypit/result";
import { FileBuildResultHistory } from "@hypit/result/node";
import type { PublicationStoreLocation } from "./execution.js";
import { FileBuildFinalizationStore } from "./result-storage/store.js";
import type { BuildFinalizationStore } from "./result-storage/types.js";
import {
  ExecutionEnvironmentAdapterRegistry,
} from "@hypit/execution-environment-local/extension";
import type {
  ExecutionEnvironmentDoctorDiagnostic,
} from "@hypit/execution-environment-local/extension";
import {
  LocalExecutionEnvironmentDeployment,
  openLocalExecutionEnvironmentProfile,
} from "@hypit/execution-environment-local/deployment";
import type {
  ActivatedLocalExecutionEnvironmentEndpoint,
  OpenedLocalExecutionEnvironmentCredentialStores,
} from "@hypit/execution-environment-local/deployment";
import { createLocalExecutionEnvironmentHost } from "@hypit/execution-environment-local/host";
import type {
  RuntimeHostEndpointObservation,
  RuntimeHostEndpointPricing,
  RuntimeHostEndpointQuery,
} from "./host-api.js";
import { SqliteRuntimeState } from "./sqlite-state.js";

import { createLocalRuntime } from "./runtime.js";
import {
  createLocalRuntimeControl,
} from "./control.js";
import {
  localExecutionEnvironmentProfileValue,
  parseLocalExecutionEnvironmentProfile,
} from "@hypit/execution-environment-local/profile";
import { createLocalBuildFinalizer } from "./build-finalizer.js";
import type {
  LocalBuildFinalizer,
  LocalRuntime,
  LocalRuntimeControl,
} from "./types.js";

export type LocalRuntimeProfile = {
  readonly format: "hypit.generation-runtime-local@1";
  readonly dataRoot: string;
  /** Environment Profile path, resolved relative to this Generation Runtime Profile. */
  readonly environment: string;
  /** Coordinator policy, independent of any Build's selected Endpoints. */
  readonly worker?: { readonly executionMemoryMb: number };
  /** Build execution policy captured for new submissions. */
  readonly execution?: { readonly producerInlineValueBytes: number };
};

export type ProjectPublicationStoresDoctorResult = {
  readonly location?: PublicationStoreLocation;
  readonly diagnostics: readonly ExecutionEnvironmentDoctorDiagnostic[];
};

export type LoadRuntimeConfigOptions = {
  readonly registry?: ExecutionEnvironmentAdapterRegistry;
  /** Execution-owned module bindings; omitted for ordinary short-lived CLI calls. */
  readonly importModule?: (url: string) => Promise<unknown>;
  readonly endpoints?: readonly string[];
  readonly packageRoot?: string;
  readonly distributionPackageRoot?: string;
  /** Persistent machine/user state. Defaults to the platform Hypit state root. */
  readonly hostStateRoot?: string;
};

export type RuntimeConfigDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly ExecutionEnvironmentDoctorDiagnostic[];
};

export type RuntimeConfigInspection = {
  readonly dataRoot: string;
  endpoints(): Promise<readonly RuntimeHostEndpointObservation[]>;
  pricing(): Promise<readonly RuntimeHostEndpointPricing[]>;
  preflight(): Promise<RuntimeConfigDoctorResult>;
  createRuntime(): Promise<LocalRuntime>;
  close(): void | Promise<void>;
};

type RuntimeInspectionOptions = LoadRuntimeConfigOptions & {
  readonly capabilities?: readonly CapabilityRef[];
  readonly endpoints?: readonly string[];
  readonly active: boolean;
};

/** Explicit deployment scope. Bindings narrow discovery before unused packages are loaded. */
export type ResolvedRuntimeConfigPaths = {
  readonly packageRoot: string;
  readonly dataRoot: string;
  readonly environmentProfile: string;
  readonly environmentDataRoot: string;
};

type OpenedRuntimeConfig = {
  readonly absolute: string;
  readonly document: LocalRuntimeProfile;
  readonly environment: LocalExecutionEnvironmentDeployment;
  readonly root: string;
  readonly environmentAbsolute: string;
  readonly environmentRoot: string;
  readonly profileRoot: string;
  readonly packageRoot: string;
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${subject} does not accept ${unknown.join(", ")}; it accepts ${allowed.join(", ")}`);
  }
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

export function parseLocalRuntimeProfile(value: unknown): LocalRuntimeProfile {
  const item = object(value, "$runtime");
  exactKeys(item, ["format", "dataRoot", "environment", "worker", "execution"], "$runtime");
  if (item.format !== "hypit.generation-runtime-local@1") {
    throw new Error("$runtime.format must be hypit.generation-runtime-local@1");
  }
  let worker: LocalRuntimeProfile["worker"];
  if (item.worker !== undefined) {
    const settings = object(item.worker, "$runtime.worker");
    exactKeys(settings, ["executionMemoryMb"], "$runtime.worker");
    const budget = settings.executionMemoryMb;
    if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget <= 0) {
      throw new Error("$runtime.worker.executionMemoryMb must be a positive integer in MiB");
    }
    worker = { executionMemoryMb: budget };
  }
  let execution: LocalRuntimeProfile["execution"];
  if (item.execution !== undefined) {
    const settings = object(item.execution, "$runtime.execution");
    exactKeys(settings, ["producerInlineValueBytes"], "$runtime.execution");
    const budget = settings.producerInlineValueBytes;
    if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget <= 0) {
      throw new Error("$runtime.execution.producerInlineValueBytes must be a positive integer in bytes");
    }
    execution = { producerInlineValueBytes: budget };
  }
  return {
    format: "hypit.generation-runtime-local@1",
    dataRoot: requiredString(item.dataRoot, "$runtime.dataRoot"),
    environment: requiredString(item.environment, "$runtime.environment"),
    ...(worker === undefined ? {} : { worker }),
    ...(execution === undefined ? {} : { execution }),
  };
}

/** Read only process policy; starting a coordinator does not load selected project packages. */
export async function readRuntimeWorkerOptions(path: string): Promise<{ readonly executionMemoryMb: number }> {
  return (await openGenerationRuntimeProfile(path)).document.worker ?? { executionMemoryMb: 1024 };
}

/** Read the deterministic execution policy shared by planning and submitted Builds. */
export async function readRuntimePlanningPolicy(
  path: string,
  packageRootHint?: string,
): Promise<{ readonly producerExecutionLimits?: { readonly maxInlineValueBytes: number } }> {
  void packageRootHint;
  const execution = (await openGenerationRuntimeProfile(path)).document.execution;
  return execution === undefined ? {} : {
    producerExecutionLimits: { maxInlineValueBytes: execution.producerInlineValueBytes },
  };
}

async function openGenerationRuntimeProfile(path: string): Promise<{
  readonly absolute: string;
  readonly profileRoot: string;
  readonly document: LocalRuntimeProfile;
}> {
  const absolute = resolve(path);
  const source = await readFile(absolute, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`Runtime Profile ${absolute} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error });
  }
  return { absolute, profileRoot: dirname(absolute), document: parseLocalRuntimeProfile(value) };
}

async function openRuntimeConfig(path: string, options: LoadRuntimeConfigOptions = {}): Promise<OpenedRuntimeConfig> {
  const openedRuntime = await openGenerationRuntimeProfile(path);
  const { absolute, profileRoot, document: runtime } = openedRuntime;
  const environmentAbsolute = resolve(profileRoot, runtime.environment);
  const openedEnvironment = await openLocalExecutionEnvironmentProfile(environmentAbsolute);
  const packageRoot = resolve(options.packageRoot ?? profileRoot);
  return {
    absolute,
    document: runtime,
    environment: new LocalExecutionEnvironmentDeployment(openedEnvironment.document, openedEnvironment.dataRoot, {
      packageRoot,
      ...(options.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: options.distributionPackageRoot }),
      ...(options.hostStateRoot === undefined ? {} : { hostStateRoot: options.hostStateRoot }),
      ...(options.registry === undefined ? {} : { registry: options.registry }),
      ...(options.importModule === undefined ? {} : { importModule: options.importModule }),
    }),
    root: resolve(profileRoot, runtime.dataRoot),
    environmentAbsolute,
    environmentRoot: openedEnvironment.dataRoot,
    profileRoot,
    packageRoot,
  };
}

async function openPublicationStoresInternal(
  location: PublicationStoreLocation,
): Promise<{
  readonly history: BuildResultHistory;
  readonly products: ProductHistory;
  readonly finalization: BuildFinalizationStore;
}> {
  const finalization = new FileBuildFinalizationStore(
    resolve(location.root, location.historyPath),
    resolve(location.root, location.productsPath),
  );
  const history = new FileBuildResultHistory(resolve(location.root, location.historyPath));
  const products = new FileProductHistory(resolve(location.root, location.productsPath));
  return { history, products, finalization };
}

export async function openPublicationStoresAtLocation(
  location: PublicationStoreLocation,
): Promise<{
  readonly history: BuildResultHistory;
  readonly products: ProductHistory;
  readonly finalization: BuildFinalizationStore;
}> {
  return await openPublicationStoresInternal(location);
}

export async function openProjectPublicationStores(
  projectRoot: string,
): Promise<{
  readonly history: BuildResultHistory;
  readonly products: ProductHistory;
  readonly finalization: BuildFinalizationStore;
  readonly location: PublicationStoreLocation;
}> {
  const location = projectPublicationStoreLocation(projectRoot);
  const result = await openPublicationStoresInternal(location);
  return { ...result, location };
}

function projectPublicationStoreLocation(projectRoot: string): PublicationStoreLocation {
  return {
    root: resolve(projectRoot),
    historyPath: ".hypit/generation/results",
    productsPath: ".hypit/generation/products",
  };
}

async function diagnosePublicationDirectory(
  path: string,
  code: string,
): Promise<ExecutionEnvironmentDoctorDiagnostic | undefined> {
  let current = path;
  try {
    while (true) {
      const found = await stat(current).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
        throw error;
      });
      if (found !== undefined) {
        if (!found.isDirectory()) throw new Error(`${current} is not a directory`);
        await access(current, constants.R_OK | constants.W_OK);
        return undefined;
      }
      const parent = dirname(current);
      if (parent === current) throw new Error(`no existing parent directory for ${path}`);
      current = parent;
    }
  } catch (error) {
    return {
      severity: "error",
      code,
      message: error instanceof Error ? error.message : String(error),
      subject: path,
    };
  }
}

/** Diagnose the project-owned Build-history and Product roots without reading or mutating them. */
export async function doctorProjectPublicationStores(
  projectRoot: string,
): Promise<ProjectPublicationStoresDoctorResult> {
  const location = projectPublicationStoreLocation(projectRoot);
  const [history, products] = await Promise.all([
    diagnosePublicationDirectory(
      resolve(location.root, location.historyPath),
      "RUN_HISTORY_DIRECTORY_UNAVAILABLE",
    ),
    diagnosePublicationDirectory(
      resolve(location.root, location.productsPath),
      "PRODUCT_DIRECTORY_UNAVAILABLE",
    ),
  ]);
  return { location, diagnostics: [history, products].filter((item) => item !== undefined) };
}

export async function resolveRuntimeConfigPaths(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<ResolvedRuntimeConfigPaths> {
  const opened = await openRuntimeConfig(path, options);
  return {
    packageRoot: opened.packageRoot,
    dataRoot: opened.root,
    environmentProfile: opened.environmentAbsolute,
    environmentDataRoot: opened.environmentRoot,
  };
}

async function inspectGenerationDataRoot(opened: OpenedRuntimeConfig): Promise<ExecutionEnvironmentDoctorDiagnostic | undefined> {
  try {
    if (!(await stat(opened.root)).isDirectory()) {
      throw new Error(`Generation Runtime data root ${opened.root} is not a directory`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    return diagnostic(error, "GENERATION_RUNTIME_DATA_ROOT_INVALID", opened.root);
  }
  return undefined;
}

/**
 * Freeze one Environment inspection for plan, pricing and Runtime assembly. Generation adds only
 * its own data-root check and Build Runtime construction.
 */
export async function openRuntimeConfigInspection(
  path: string,
  queries: readonly RuntimeHostEndpointQuery[],
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfigInspection> {
  const opened = await openRuntimeConfig(path, options);
  const environment = await createLocalExecutionEnvironmentHost(
    opened.environmentAbsolute,
    opened.environment,
  ).openInspection(queries);
  let observations: Promise<readonly RuntimeHostEndpointObservation[]> | undefined;
  let runtime: Promise<LocalRuntime> | undefined;
  let preflight: Promise<RuntimeConfigDoctorResult> | undefined;
  const endpointObservations = async () => await (observations ??= environment.endpoints());
  const selectedEndpoints = async (): Promise<readonly string[]> => [...new Set(
    (await endpointObservations()).flatMap((item) =>
      item.status === "resolved" && item.endpoint !== undefined ? [item.endpoint] : []),
  )];
  return {
    dataRoot: opened.root,
    endpoints: endpointObservations,
    pricing: async () => await environment.pricing(),
    preflight: async () => await (preflight ??= (async () => {
      const generationDiagnostic = await inspectGenerationDataRoot(opened);
      const result = await environment.preflight();
      return {
        dataRoot: opened.root,
        diagnostics: [
          ...(generationDiagnostic === undefined ? [] : [generationDiagnostic]),
          ...result.diagnostics,
        ],
      };
    })()),
    createRuntime: async () => await (runtime ??= createRuntimeFromOpened(
      { ...opened, environment: environment.deployment },
      {
        ...options,
        registry: environment.deployment.registry,
        endpoints: await selectedEndpoints(),
      },
      undefined,
      environment.activations,
    )),
    close: async () => await environment.close(),
  };
}

function diagnostic(error: unknown, code: string, subject?: string): ExecutionEnvironmentDoctorDiagnostic {
  return {
    severity: "error",
    code,
    message: error instanceof Error ? error.message : String(error),
    ...(subject === undefined ? {} : { subject }),
  };
}

export function statePath(root: string): string {
  return resolve(root, "runtime.sqlite");
}

function buildWorkPath(root: string, build: string): string {
  assertBuildId(build);
  if (build === "." || build === ".." || build.includes("/") || build.includes("\\")
    || build.includes("\0") || build.includes(":")) {
    throw new Error(`Build ${build} is not a local Runtime work-directory name`);
  }
  const work = resolve(root, "work");
  const target = resolve(work, build);
  const relation = relative(work, target);
  if (relation.length === 0 || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`Build ${build} leaves Runtime work root ${work}`);
  }
  return target;
}

async function inspectRuntimeAndEnvironment(
  path: string,
  options: LoadRuntimeConfigOptions & {
    readonly capabilities?: readonly CapabilityRef[];
    readonly endpoints?: readonly string[];
  },
  active: boolean,
): Promise<RuntimeConfigDoctorResult> {
  const opened = await openRuntimeConfig(path, options);
  const generationDiagnostic = await inspectGenerationDataRoot(opened);
  const environmentHost = createLocalExecutionEnvironmentHost(
    opened.environmentAbsolute,
    opened.environment,
  );
  const environment = active
    ? await environmentHost.doctor(options)
    : await environmentHost.preflight(options);
  return {
    dataRoot: opened.root,
    diagnostics: [
      ...(generationDiagnostic === undefined ? [] : [generationDiagnostic]),
      ...environment.diagnostics,
    ],
  };
}

/** Cheap local validation. Environment checks remain owned by the Environment Host. */
export async function preflightRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & {
    readonly capabilities?: readonly CapabilityRef[];
    readonly endpoints?: readonly string[];
  } = {},
): Promise<RuntimeConfigDoctorResult> {
  return await inspectRuntimeAndEnvironment(path, options, false);
}

/** Active Environment diagnosis plus the Generation Runtime's own data-root check. */
export async function doctorRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & {
    readonly capabilities?: readonly CapabilityRef[];
    readonly endpoints?: readonly string[];
  } = {},
): Promise<RuntimeConfigDoctorResult> {
  return await inspectRuntimeAndEnvironment(path, options, true);
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  return await createRuntimeFromOpened(await openRuntimeConfig(path, options), options);
}

/** Execution choices are captured at submission; later Profile edits belong to later Builds. */
export type LocalExecutionContext = {
  readonly format: "hypit.local-generation-execution@1";
  readonly packageRoot: string;
  readonly hostStateRoot: string;
  readonly distributionPackageRoot?: string;
  readonly runtime: CanonicalValue;
  readonly environment: CanonicalValue;
};

export function localExecutionContext(value: CanonicalValue | undefined): LocalExecutionContext {
  const record = object(value, "Build execution context");
  exactKeys(record, ["format", "packageRoot", "hostStateRoot", "distributionPackageRoot", "runtime", "environment"], "Build execution context");
  if (record.format !== "hypit.local-generation-execution@1") {
    throw new Error("Build has no local Generation execution context; create a new Build");
  }
  return {
    format: "hypit.local-generation-execution@1",
    packageRoot: requiredString(record.packageRoot, "execution.packageRoot"),
    hostStateRoot: requiredString(record.hostStateRoot, "execution.hostStateRoot"),
    ...(record.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: requiredString(record.distributionPackageRoot, "execution.distributionPackageRoot") }),
    runtime: record.runtime as CanonicalValue,
    environment: record.environment as CanonicalValue,
  };
}

function localGenerationRuntimeSnapshot(value: CanonicalValue): {
  readonly dataRoot: string;
  readonly execution?: LocalRuntimeProfile["execution"];
} {
  const record = object(value, "Generation Runtime snapshot");
  exactKeys(record, ["format", "dataRoot", "execution"], "Generation Runtime snapshot");
  if (record.format !== "hypit.local-generation-runtime-snapshot@1") {
    throw new Error("Generation Runtime snapshot format must be hypit.local-generation-runtime-snapshot@1");
  }
  let execution: LocalRuntimeProfile["execution"];
  if (record.execution !== undefined) {
    const settings = object(record.execution, "Generation Runtime snapshot.execution");
    exactKeys(settings, ["producerInlineValueBytes"], "Generation Runtime snapshot.execution");
    const budget = settings.producerInlineValueBytes;
    if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget <= 0) {
      throw new Error("Generation Runtime snapshot.execution.producerInlineValueBytes must be a positive integer in bytes");
    }
    execution = { producerInlineValueBytes: budget };
  }
  return {
    dataRoot: requiredString(record.dataRoot, "Generation Runtime snapshot.dataRoot"),
    ...(execution === undefined ? {} : { execution }),
  };
}

export async function createRuntimeForBuild(dataRoot: string, build: string, execution: {
  readonly state: SqliteRuntimeState;
  readonly importModule: (url: string) => Promise<unknown>;
}): Promise<LocalRuntime> {
  const context = localExecutionContext((await execution.state.execution.read(build))?.context);
  const runtime = localGenerationRuntimeSnapshot(context.runtime);
  const environmentDocument = parseLocalExecutionEnvironmentProfile(context.environment);
  const environmentRoot = resolve(dataRoot, environmentDocument.dataRoot);
  return await createRuntimeFromOpened({
    absolute: dataRoot,
    profileRoot: dataRoot,
    root: runtime.dataRoot,
    environmentAbsolute: dataRoot,
    environmentRoot,
    packageRoot: context.packageRoot,
    environment: new LocalExecutionEnvironmentDeployment(environmentDocument, environmentRoot, {
      packageRoot: context.packageRoot,
      hostStateRoot: context.hostStateRoot,
      ...(context.distributionPackageRoot === undefined ? {} : {
        distributionPackageRoot: context.distributionPackageRoot,
      }),
      importModule: execution.importModule,
    }),
    document: {
      format: "hypit.generation-runtime-local@1",
      dataRoot: runtime.dataRoot,
      environment: "<captured>",
      ...(runtime.execution === undefined ? {} : { execution: runtime.execution }),
    },
  }, { ...context, importModule: execution.importModule }, { state: execution.state, build });
}

async function createRuntimeFromOpened(opened: OpenedRuntimeConfig, options: LoadRuntimeConfigOptions, execution?: {
  readonly state: SqliteRuntimeState; readonly build: string;
}, preparedActivations?: readonly ActivatedLocalExecutionEnvironmentEndpoint[]): Promise<LocalRuntime> {
  const { root, packageRoot, document } = opened;
  let environment = opened.environment.scope(options);
  const state = execution?.state ?? new SqliteRuntimeState(statePath(root));
  let credentials: OpenedLocalExecutionEnvironmentCredentialStores | undefined;
  try {
    const prepared = new Map(preparedActivations?.map((item) => [item.entry.instance, item.activation.endpoint]));
    const endpoints = preparedActivations === undefined
      ? (await environment.activateEndpoints()).map((item) => item.activation.endpoint)
      : environment.document.endpoints.map((item) => {
        const endpoint = prepared.get(item.instance);
        if (endpoint === undefined) throw new Error(`Runtime inspection has no activated Endpoint ${item.instance}`);
        return endpoint;
      });
    environment = environment.credentialsFor(endpoints);
    credentials = await environment.openCredentialStores();
    const context = {
      format: "hypit.local-generation-execution@1", packageRoot, hostStateRoot: environment.hostStateRoot,
      ...(options.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: options.distributionPackageRoot }),
      runtime: {
        format: "hypit.local-generation-runtime-snapshot@1",
        dataRoot: root,
        ...(document.execution === undefined ? {} : { execution: document.execution }),
      },
      environment: localExecutionEnvironmentProfileValue({
        format: "hypit.execution-environment-local@1",
        dataRoot: environment.dataRoot,
        credentials: environment.document.credentials,
        endpoints: environment.document.endpoints,
        bindings: environment.document.bindings,
      }, environment.dataRoot),
    } as CanonicalValue;
    return await createLocalRuntime({
      ...(execution === undefined ? {} : { executionBuild: execution.build }),
      executionContext: context,
      ...(document.execution === undefined ? {} : {
        producerExecutionLimits: { maxInlineValueBytes: document.execution.producerInlineValueBytes },
      }),
      buildStore: state.builds,
      operationStore: state.operations,
      commandExecutionStore: state.commandExecutions,
      executionLogs: fileExecutionLogs((build) => buildWorkPath(root, build)),
      executionStore: state.execution,
      removeActiveBuild: async (build) => await state.removeActiveBuild(build),
      submissionStore: state.submissions,
      resourceStore: new FileResourceStore(resolve(root, "resources")),
      resourceStoreForBuild: (build) => new FileResourceStore(buildWorkPath(root, build)),
      clearBuildResources: async (build) => {
        await rm(buildWorkPath(root, build), { recursive: true, force: true });
      },
      openPublicationStores: openPublicationStoresInternal,
      credentialStore: credentials.store,
      loadProducerPackages: async (specifiers) => {
        const loaded = await loadNodePackageSelection(specifiers, packageRoot, {
          ...(options.importModule === undefined ? {} : { importModule: options.importModule }),
          ...(options.distributionPackageRoot === undefined
            ? {}
            : { fallbackRoots: [options.distributionPackageRoot] }),
        });
        return loaded;
      },
      endpoints,
      bindings: environment.document.bindings,
      close: async () => {
        await credentials?.close();
        if (execution === undefined) state.close();
      },
    });
  } catch (error) {
    await credentials?.close();
    if (execution === undefined) state.close();
    throw error;
  }
}

export async function createRuntimeControlFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly readOnly?: boolean } = {},
): Promise<LocalRuntimeControl> {
  const { root } = await openRuntimeConfig(path, options);
  const state = new SqliteRuntimeState(statePath(root), { readOnly: options.readOnly === true });
  return createLocalRuntimeControl({
    buildStore: state.builds,
    commandExecutionStore: state.commandExecutions,
    executionLogs: fileExecutionLogs((build) => buildWorkPath(root, build)),
    openPublicationStores: openPublicationStoresInternal,
    operationStore: state.operations,
    executionStore: state.execution,
    submissionStore: state.submissions,
    close: () => state.close(),
  });
}

export function createRuntimeFinalizer(root: string): LocalBuildFinalizer {
  const state = new SqliteRuntimeState(statePath(root));
  return createLocalBuildFinalizer({
    buildStore: state.builds,
    operationStore: state.operations,
    commandExecutionStore: state.commandExecutions,
    executionLogs: fileExecutionLogs((build) => buildWorkPath(root, build)),
    executionStore: state.execution,
    removeActiveBuild: async (build) => await state.removeActiveBuild(build),
    submissionStore: state.submissions,
    resourceStore: new FileResourceStore(resolve(root, "resources")),
    resourceStoreForBuild: (build) => new FileResourceStore(buildWorkPath(root, build)),
    clearBuildResources: async (build) => {
      await rm(buildWorkPath(root, build), { recursive: true, force: true });
    },
    openPublicationStores: openPublicationStoresInternal,
    close: () => state.close(),
  });
}

