import { readFile, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  collectLoadedNodePackageComponents,
  distributionExternalPackageRequirements,
  loadNodePackageSelection,
} from "@hypit/package-loader-node";
import type { NodePackageSelectionRequest } from "@hypit/package-loader-node";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue, CapabilityRef } from "@hypit/protocol";
import {
  CompositeCredentialStore,
} from "@hypit/runtime";
import type { CredentialStore } from "@hypit/runtime";
import { FileArtifactStore } from "@hypit/artifact-store-fs";
import {
  isRuntimeAdapterHostFacet,
  runtimeCredentialStoreAdapterHostAbi,
  runtimeEndpointAdapterHostAbi,
  RuntimeAdapterRegistry,
} from "@hypit/runtime-kit";
import type {
  ManagedProgram,
  ManagedProgramState,
  RuntimeAdapterFactoryContext,
  RuntimeDoctorDiagnostic,
  RuntimeEndpointActivation,
  RuntimeOpened,
} from "@hypit/runtime-kit";
import {
  hypitHostPackageRoot,
  hypitHostStateRoot,
  prepareHostPackages,
} from "@hypit/runtime-host-node";
import type { HostPackageProgress, HostPackageReport } from "@hypit/runtime-host-node";
import { SqliteRuntimeState } from "@hypit/store-sqlite";

import { createLocalRuntime } from "./runtime.js";
import {
  createLocalRuntimeArchiveControl,
  createLocalRuntimeArtifactAccess,
} from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
import type {
  LocalCredentialControl,
  LocalRuntime,
  LocalRuntimeArchiveControl,
  LocalRuntimeArtifactAccess,
} from "./types.js";

export type RuntimeConfigEntry = {
  readonly use: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config?: CanonicalValue;
};

export type RuntimeConfigDocument = {
  readonly format: "hypit.runtime-profile@1";
  readonly dataRoot: string;
  readonly credentials: readonly RuntimeConfigEntry[];
  readonly endpoints: readonly RuntimeConfigEntry[];
};

export type LoadRuntimeConfigOptions = {
  readonly registry?: RuntimeAdapterRegistry;
  readonly packageRoot?: string;
  readonly distributionPackageRoot?: string;
  /** Persistent machine/user state. Defaults to the platform Hypit state root. */
  readonly hostStateRoot?: string;
};

export type RuntimeConfigDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

type RuntimeInspectionOptions = LoadRuntimeConfigOptions & {
  readonly capabilities?: readonly CapabilityRef[];
  readonly active: boolean;
};

export type ResolvedRuntimeConfigPaths = {
  readonly packageRoot: string;
  readonly dataRoot: string;
};

type OpenedRuntimeConfig = {
  readonly absolute: string;
  readonly document: RuntimeConfigDocument;
  readonly root: string;
  readonly packageRoot: string;
};

type DeclaredManagedProgram = {
  readonly instance: string;
  readonly program: ManagedProgram;
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${subject} does not accept ${unknown[0]}`);
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function entry(value: unknown, instance: string, subject: string, poolAllowed = false): RuntimeConfigEntry {
  const item = object(value, subject);
  exactKeys(item, poolAllowed ? ["use", "pool", "config"] : ["use", "config"], subject);
  const pool = item.pool === undefined ? undefined : requiredString(item.pool, `${subject}.pool`);
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance,
    ...(pool === undefined ? {} : { pool }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}

function entries(value: unknown, subject: string, poolAllowed = false): readonly RuntimeConfigEntry[] {
  const values = object(value ?? {}, subject);
  return Object.entries(values).map(([instance, item]) => {
    requiredString(instance, `${subject} instance`);
    return entry(item, instance, `${subject}.${instance}`, poolAllowed);
  });
}

export function parseRuntimeConfig(value: unknown): RuntimeConfigDocument {
  const item = object(value, "$runtime");
  exactKeys(item, ["format", "runtime"], "$runtime");
  if (item.format !== "hypit.runtime-profile@1") {
    throw new Error("$runtime.format must be hypit.runtime-profile@1");
  }
  const runtime = object(item.runtime, "$runtime.runtime");
  exactKeys(runtime, ["use", "config"], "$runtime.runtime");
  if (runtime.use !== "@hypit/runtime-local") {
    throw new Error(`Local Runtime loader cannot activate ${String(runtime.use)}`);
  }
  const config = object(runtime.config, "$runtime.runtime.config");
  exactKeys(config, ["dataRoot", "credentials", "endpoints"], "$runtime.runtime.config");
  const credentials = entries(config.credentials, "$runtime.runtime.config.credentials");
  const endpoints = entries(config.endpoints, "$runtime.runtime.config.endpoints", true);
  const ids = [...credentials, ...endpoints].map((value) => value.instance);
  if (new Set(ids).size !== ids.length) throw new Error("$runtime repeats a Runtime instance id");
  return {
    format: "hypit.runtime-profile@1",
    dataRoot: requiredString(config.dataRoot, "$runtime.runtime.config.dataRoot"),
    credentials,
    endpoints,
  };
}

async function openRuntimeConfig(path: string, packageRootHint?: string): Promise<OpenedRuntimeConfig> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const profileRoot = dirname(absolute);
  return {
    absolute,
    document,
    root: resolve(profileRoot, document.dataRoot),
    packageRoot: resolve(packageRootHint ?? profileRoot),
  };
}

function runtimePackageSelection(document: RuntimeConfigDocument): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [
      ...document.credentials.map((item) => ({ abi: runtimeCredentialStoreAdapterHostAbi, name: item.use })),
      ...document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterHostAbi, name: item.use })),
    ],
  };
}

function endpointPackageSelection(document: RuntimeConfigDocument): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterHostAbi, name: item.use })),
  };
}

async function installRuntimeAdapters(
  registry: RuntimeAdapterRegistry,
  packageRoot: string,
  selection: NodePackageSelectionRequest,
  distributionPackageRoot?: string,
): Promise<void> {
  const logical = selection.logical?.filter((address) => {
    if (address.abi === runtimeEndpointAdapterHostAbi) return !registry.has(address.name, "endpoint");
    if (address.abi === runtimeCredentialStoreAdapterHostAbi) return !registry.has(address.name, "credential-store");
    return true;
  }) ?? [];
  if (selection.selected.length === 0 && logical.length === 0) return;
  const loaded = await loadNodePackageSelection({ selected: selection.selected, logical }, packageRoot, {
    ...(distributionPackageRoot === undefined ? {} : { fallbackRoots: [distributionPackageRoot] }),
  });
  for (const item of loaded) {
    for (const facet of item.contribution.hostFacets ?? []) {
      if (isRuntimeAdapterHostFacet(facet)) registry.registerFacet(facet);
    }
  }
}

export async function resolveRuntimeConfigPaths(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<ResolvedRuntimeConfigPaths> {
  const opened = await openRuntimeConfig(path, options.packageRoot);
  return { packageRoot: opened.packageRoot, dataRoot: opened.root };
}

/** Explicit provisioning step used by runtime/programs up, never by plan or build. */
export async function prepareRuntimeConfigPackages(
  path: string,
  options: LoadRuntimeConfigOptions & {
    readonly onProgress?: (event: HostPackageProgress) => void;
  } = {},
): Promise<readonly HostPackageReport[]> {
  if (options.distributionPackageRoot === undefined) return [];
  const { document } = await openRuntimeConfig(path, options.packageRoot);
  const requirements = await distributionExternalPackageRequirements([
    ...document.credentials.map((item) => item.use),
    ...document.endpoints.map((item) => item.use),
  ], options.distributionPackageRoot);
  return await prepareHostPackages(requirements.map((item) => item.specifier), {
    root: hypitHostPackageRoot(options.hostStateRoot),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
  });
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

function adapterContext(
  root: string,
  hostStateRoot: string,
  item: RuntimeConfigEntry,
): RuntimeAdapterFactoryContext {
  return {
    hostStateRoot,
    dataRoot: root,
    instance: item.instance,
    ...(item.pool === undefined ? {} : { pool: item.pool }),
    config: item.config ?? {},
  };
}

async function activatedEndpoints(
  document: RuntimeConfigDocument,
  root: string,
  hostStateRoot: string,
  registry: RuntimeAdapterRegistry,
): Promise<readonly { readonly entry: RuntimeConfigEntry; readonly activation: RuntimeEndpointActivation }[]> {
  return await Promise.all(document.endpoints.map(async (item) => ({
    entry: item,
    activation: await registry.activateEndpoint(item.use, adapterContext(root, hostStateRoot, {
      ...item,
      pool: item.pool ?? item.instance,
    })),
  })));
}

export async function declaredManagedPrograms(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly DeclaredManagedProgram[] }> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  if (options.capabilities?.length === 0) return { dataRoot: root, programs: [] };
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, endpointPackageSelection(document), options.distributionPackageRoot);
  const requested = options.capabilities === undefined
    ? undefined
    : new Set(options.capabilities.map(capabilityKey));
  const programs: DeclaredManagedProgram[] = [];
  for (const { entry, activation } of await activatedEndpoints(document, root, hostStateRoot, registry)) {
    if (requested !== undefined && !activation.endpoint.offers.some((offer) => requested.has(capabilityKey(offer.capability)))) continue;
    if (activation.program !== undefined) programs.push({ instance: entry.instance, program: activation.program });
  }
  return { dataRoot: root, programs };
}

function diagnostic(error: unknown, code: string, subject?: string): RuntimeDoctorDiagnostic {
  return {
    severity: "error",
    code,
    message: error instanceof Error ? error.message : String(error),
    ...(subject === undefined ? {} : { subject }),
  };
}

async function openCredentialStores(
  document: RuntimeConfigDocument,
  root: string,
  hostStateRoot: string,
  registry: RuntimeAdapterRegistry,
): Promise<{ readonly store: CredentialStore; close(): Promise<void> }> {
  const opened: RuntimeOpened<CredentialStore>[] = [];
  try {
    for (const item of document.credentials) {
      opened.push(await registry.openCredentialStore(item.use, adapterContext(root, hostStateRoot, item)));
    }
    return {
      store: new CompositeCredentialStore(opened.map((item) => item.value)),
      close: async () => {
        for (const item of [...opened].reverse()) await item.close?.();
      },
    };
  } catch (error) {
    for (const item of [...opened].reverse()) await item.close?.();
    throw error;
  }
}

function statePath(root: string): string {
  return resolve(root, "runtime.sqlite");
}

function buildWorkPath(root: string, build: string): string {
  if (build.trim().length === 0 || build.includes("/") || build.includes("\\")) {
    throw new Error("Build id is not a working-directory name");
  }
  return resolve(root, "work", build);
}

async function inspectRuntimeConfig(
  path: string,
  options: RuntimeInspectionOptions,
): Promise<RuntimeConfigDoctorResult> {
  const { absolute, document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const diagnostics: RuntimeDoctorDiagnostic[] = [];
  try {
    if (!(await stat(root)).isDirectory()) throw new Error(`Runtime root ${root} is not a directory`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return { dataRoot: root, diagnostics: [diagnostic(error, "RUNTIME_DATA_ROOT_INVALID", root)] };
    }
  }
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  try {
    await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document), options.distributionPackageRoot);
  } catch (error) {
    return { dataRoot: root, diagnostics: [diagnostic(error, "RUNTIME_PACKAGE_SELECTION_INVALID")] };
  }
  const storeSelections = [
    ...document.credentials.map((item) => ({ item, kind: "credential-store" as const })),
  ];
  for (const selection of storeSelections) {
    const context = adapterContext(root, hostStateRoot, selection.item);
    try {
      diagnostics.push(...registry.validate(selection.item.use, selection.kind, context));
      if (options.active) {
        diagnostics.push(...await registry.doctor(selection.item.use, selection.kind, context));
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_COMPONENT_CONFIG_INVALID", selection.item.instance));
    }
  }
  const requested = options.capabilities === undefined
    ? undefined
    : new Set(options.capabilities.map(capabilityKey));
  const covered = new Set<string>();
  const credentialEndpoints: RuntimeEndpointActivation[] = [];
  for (const item of document.endpoints) {
    let activation: RuntimeEndpointActivation;
    try {
      activation = await registry.activateEndpoint(item.use, adapterContext(root, hostStateRoot, {
        ...item,
        pool: item.pool ?? item.instance,
      }));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ENDPOINT_CONFIG_INVALID", item.instance));
      continue;
    }
    if (requested !== undefined && !activation.endpoint.offers.some((offer) => requested.has(capabilityKey(offer.capability)))) continue;
    for (const offer of activation.endpoint.offers) covered.add(capabilityKey(offer.capability));
    try {
      diagnostics.push(...(activation.diagnose === undefined ? [] : await activation.diagnose()));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
    }
    credentialEndpoints.push(activation);
    const program = activation.program;
    if (program === undefined) continue;
    let state: ManagedProgramState;
    try {
      state = await program.probe();
    } catch (error) {
      diagnostics.push(diagnostic(error, "MANAGED_PROGRAM_PROBE_FAILED", program.id));
      continue;
    }
    if (state.state !== "ready") {
      diagnostics.push({
        severity: "error",
        code: state.state === "down" ? "MANAGED_PROGRAM_DOWN" : "MANAGED_PROGRAM_MISMATCH",
        message: `${program.id} is not usable: ${state.detail}`,
        subject: program.id,
      });
    }
  }
  for (const capability of options.capabilities ?? []) {
    if (!covered.has(capabilityKey(capability))) diagnostics.push({
      severity: "error",
      code: "RUNTIME_CAPABILITY_UNBOUND",
      message: `No usable Endpoint in this Runtime Profile fulfills ${capabilityKey(capability)}`,
      subject: capabilityKey(capability),
    });
  }
  if (credentialEndpoints.some((item) => item.endpoint.credentials.length > 0)) {
    let stores: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
    try {
      stores = await openCredentialStores(document, root, hostStateRoot, registry);
      for (const activation of credentialEndpoints) {
        for (const slot of activation.endpoint.credentials) {
          if (await stores.store.resolve(slot.ref) !== undefined) continue;
          diagnostics.push({
            severity: "error",
            code: "RUNTIME_CREDENTIAL_MISSING",
            message: `${slot.label} for Endpoint ${slot.endpoint} is not configured. ${
              slot.ref.store === "env"
                ? slot.ref.key === "HYPIHUB_API_KEY"
                  ? `Sign in with HypiHub using: hypit auth login ${slot.endpoint} --runtime ${absolute}`
                  : `Set ${slot.ref.key} in this process environment.`
                : `Configure it with: hypit auth login ${slot.endpoint} --runtime ${absolute}`}`,
            subject: `${slot.endpoint}.${slot.slot}`,
          });
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_CREDENTIAL_CHECK_FAILED"));
    } finally {
      await stores?.close();
    }
  }
  return { dataRoot: root, diagnostics };
}

/**
 * Cheap Build preflight. This intentionally stops at local configuration,
 * package, credential, executable and Managed Program readiness. Remote
 * connectivity belongs to doctor, and installation belongs to runtime up.
 */
export async function preflightRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<RuntimeConfigDoctorResult> {
  return await inspectRuntimeConfig(path, { ...options, active: false });
}

/** Active diagnosis may ask selected credentials and Endpoints to verify their configured services. */
export async function doctorRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<RuntimeConfigDoctorResult> {
  return await inspectRuntimeConfig(path, { ...options, active: true });
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document), options.distributionPackageRoot);
  const state = new SqliteRuntimeState(statePath(root));
  let credentials: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
  try {
    credentials = await openCredentialStores(document, root, hostStateRoot, registry);
    const endpoints = await Promise.all(document.endpoints.map(async (item) => await registry.createEndpoint(
      item.use,
      adapterContext(root, hostStateRoot, { ...item, pool: item.pool ?? item.instance }),
    )));
    return await createLocalRuntime({
      buildStore: state.builds,
      buildCatalog: state.catalog,
      operationStore: state.operations,
      dispatchStore: state.dispatch,
      artifactStore: new FileArtifactStore(resolve(root, "artifacts")),
      artifactStoreForBuild: (build) => new FileArtifactStore(buildWorkPath(root, build)),
      clearBuildArtifacts: async (build) => {
        await rm(buildWorkPath(root, build), { recursive: true, force: true });
      },
      credentialStore: credentials.store,
      loadComponentPackages: async (specifiers) => {
        const loaded = await loadNodePackageSelection(specifiers, packageRoot, {
          ...(options.distributionPackageRoot === undefined
            ? {}
            : { fallbackRoots: [options.distributionPackageRoot] }),
        });
        return collectLoadedNodePackageComponents(loaded);
      },
      endpoints,
      close: async () => {
        await credentials?.close();
        state.close();
      },
    });
  } catch (error) {
    await credentials?.close();
    state.close();
    throw error;
  }
}

export async function createRuntimeArchiveFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly readOnly?: boolean } = {},
): Promise<LocalRuntimeArchiveControl> {
  const { root } = await openRuntimeConfig(path, options.packageRoot);
  const state = new SqliteRuntimeState(statePath(root), { readOnly: options.readOnly === true });
  return createLocalRuntimeArchiveControl({
    buildStore: state.builds,
    buildCatalog: state.catalog,
    operationStore: state.operations,
    dispatchStore: state.dispatch,
    close: () => state.close(),
  });
}

export async function createRuntimeArtifactAccessFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeArtifactAccess> {
  const { root } = await openRuntimeConfig(path, options.packageRoot);
  return createLocalRuntimeArtifactAccess({
    artifactStore: new FileArtifactStore(resolve(root, "artifacts")),
  });
}

export async function createRuntimeCredentialsFromConfig(
  path: string,
  endpointInstance: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalCredentialControl> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const endpoint = document.endpoints.find((item) => item.instance === endpointInstance);
  if (endpoint === undefined) throw new Error(`Runtime Profile has no Endpoint instance ${endpointInstance}`);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document), options.distributionPackageRoot);
  const credentials = await openCredentialStores(document, root, hostStateRoot, registry);
  try {
    const endpointPackage = await registry.createEndpoint(endpoint.use, adapterContext(root, hostStateRoot, {
      ...endpoint,
      pool: endpoint.pool ?? endpoint.instance,
    }));
    return createLocalCredentialControl({
      credentialStore: credentials.store,
      endpoints: [endpointPackage],
      close: credentials.close,
    });
  } catch (error) {
    await credentials.close();
    throw error;
  }
}
