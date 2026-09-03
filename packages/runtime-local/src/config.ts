import { readFile, rm, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import {
  collectLoadedNodePackageComponents,
  distributionExternalPackageRequirements,
  loadNodePackageSelection,
} from "@hypit/package-loader-node";
import type { NodePackageSelectionRequest } from "@hypit/package-loader-node";
import { assertBuildId, canonicalize, canonicalStringify } from "@hypit/protocol";
import type { CanonicalValue, CapabilityRef, Need } from "@hypit/protocol";
import {
  CompositeCredentialStore,
} from "@hypit/runtime";
import type { CredentialStore, CredentialValue } from "@hypit/runtime";
import { FileResourceStore } from "@hypit/resource-store-fs";
import { FileBuildResultRepository } from "@hypit/build-result";
import {
  buildResultRepositoryHostAbi,
  BuildResultRepositoryRegistry,
  isBuildResultRepositoryHostFacet,
} from "@hypit/build-result-kit";
import type {
  BuildResultRepositoryDiagnostic,
  BuildResultRepositoryLocation,
  BuildResultRepositoryOpened,
} from "@hypit/build-result-kit";
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
import type { HostPackageProgress, HostPackageReport, RuntimeHostNeedQuote } from "@hypit/runtime-host-node";
import { SqliteRuntimeState } from "@hypit/store-sqlite";

import { createLocalRuntime } from "./runtime.js";
import {
  createLocalRuntimeControl,
} from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
import { createLocalResultWriter } from "./result-writer.js";
import type {
  LocalCredentialControl,
  LocalResultWriter,
  LocalRuntime,
  LocalRuntimeControl,
} from "./types.js";

export type LocalRuntimeAdapterSelection = {
  readonly use: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config?: CanonicalValue;
};

export type LocalRuntimeProfile = {
  readonly format: "hypit.runtime-local@1";
  readonly dataRoot: string;
  readonly credentials: readonly LocalRuntimeAdapterSelection[];
  readonly endpoints: readonly LocalRuntimeAdapterSelection[];
};

export type ProjectBuildResultConfig = {
  readonly format: "hypit.build-results@1";
  readonly use: string;
  readonly config?: CanonicalValue;
};

export type ProjectBuildResultDoctorResult = {
  readonly location?: BuildResultRepositoryLocation;
  readonly diagnostics: readonly BuildResultRepositoryDiagnostic[];
};

export type LoadRuntimeConfigOptions = {
  readonly registry?: RuntimeAdapterRegistry;
  readonly resultRegistry?: BuildResultRepositoryRegistry;
  readonly packageRoot?: string;
  readonly distributionPackageRoot?: string;
  /** Persistent machine/user state. Defaults to the platform Hypit state root. */
  readonly hostStateRoot?: string;
  /** Worker-only ownership check performed before reclaiming or claiming execution. */
  readonly assertExecutionOwner?: () => Promise<void> | void;
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
  readonly document: LocalRuntimeProfile;
  readonly root: string;
  readonly profileRoot: string;
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

function entry(value: unknown, instance: string, subject: string, poolAllowed = false): LocalRuntimeAdapterSelection {
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

function entries(value: unknown, subject: string, poolAllowed = false): readonly LocalRuntimeAdapterSelection[] {
  const values = object(value ?? {}, subject);
  return Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).map(([instance, item]) => {
    requiredString(instance, `${subject} instance`);
    return entry(item, instance, `${subject}.${instance}`, poolAllowed);
  });
}

export function parseLocalRuntimeProfile(value: unknown): LocalRuntimeProfile {
  const item = object(value, "$runtime");
  exactKeys(item, ["format", "dataRoot", "credentials", "endpoints"], "$runtime");
  if (item.format !== "hypit.runtime-local@1") {
    throw new Error("$runtime.format must be hypit.runtime-local@1");
  }
  const credentials = entries(item.credentials, "$runtime.credentials");
  const endpoints = entries(item.endpoints, "$runtime.endpoints", true);
  const ids = [...credentials, ...endpoints].map((value) => value.instance);
  if (new Set(ids).size !== ids.length) throw new Error("$runtime repeats a Runtime instance id");
  return {
    format: "hypit.runtime-local@1",
    dataRoot: requiredString(item.dataRoot, "$runtime.dataRoot"),
    credentials,
    endpoints,
  };
}

async function openRuntimeConfig(path: string, packageRootHint?: string): Promise<OpenedRuntimeConfig> {
  const absolute = resolve(path);
  const document = parseLocalRuntimeProfile(JSON.parse(await readFile(absolute, "utf8")));
  const profileRoot = dirname(absolute);
  return {
    absolute,
    document,
    root: resolve(profileRoot, document.dataRoot),
    profileRoot,
    packageRoot: resolve(packageRootHint ?? profileRoot),
  };
}

function runtimePackageSelection(document: LocalRuntimeProfile): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [
      ...document.credentials.map((item) => ({ abi: runtimeCredentialStoreAdapterHostAbi, name: item.use })),
      ...document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterHostAbi, name: item.use })),
    ],
  };
}

function resultPackageSelection(use: string): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [{ abi: buildResultRepositoryHostAbi, name: use }],
  };
}

function endpointPackageSelection(document: LocalRuntimeProfile): NodePackageSelectionRequest {
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

async function installBuildResultAdapter(
  registry: BuildResultRepositoryRegistry,
  packageRoot: string,
  use: string,
  distributionPackageRoot?: string,
): Promise<void> {
  if (registry.has(use)) return;
  const loaded = await loadNodePackageSelection(resultPackageSelection(use), packageRoot, {
    ...(distributionPackageRoot === undefined ? {} : { fallbackRoots: [distributionPackageRoot] }),
  });
  for (const item of loaded) {
    for (const facet of item.contribution.hostFacets ?? []) {
      if (isBuildResultRepositoryHostFacet(facet)) registry.registerFacet(facet);
    }
  }
  if (!registry.has(use)) throw new Error(`Package selection did not provide Build Result Repository ${use}`);
}

async function openBuildResultLocation(
  location: BuildResultRepositoryLocation,
  options: LoadRuntimeConfigOptions,
  packageRoot: string,
  registry: BuildResultRepositoryRegistry,
): Promise<BuildResultRepositoryOpened> {
  await installBuildResultAdapter(registry, packageRoot, location.selection.use, options.distributionPackageRoot);
  return await registry.open(location.selection, location.root);
}

export async function openBuildResultRepositoryLocation(
  location: BuildResultRepositoryLocation,
  options: LoadRuntimeConfigOptions = {},
): Promise<BuildResultRepositoryOpened> {
  const root = resolve(location.root);
  const registry = options.resultRegistry ?? new BuildResultRepositoryRegistry();
  return await openBuildResultLocation(location, options, resolve(options.packageRoot ?? root), registry);
}

export async function openProjectBuildResultRepository(
  projectRoot: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<BuildResultRepositoryOpened & { readonly location: BuildResultRepositoryLocation }> {
  const root = resolve(projectRoot);
  const selected = await projectBuildResultLocation(root);
  const location = selected.location;
  if (selected.implicit) {
    return {
      location,
      repository: new FileBuildResultRepository(resolve(root, ".hypit/results")),
    };
  }
  const registry = options.resultRegistry ?? new BuildResultRepositoryRegistry();
  const result = await openBuildResultLocation(location, options, resolve(options.packageRoot ?? root), registry);
  return { ...result, location };
}

async function projectBuildResultLocation(root: string): Promise<{
  readonly location: BuildResultRepositoryLocation;
  readonly implicit: boolean;
}> {
  const configPath = resolve(root, "hypit.results.json");
  const text = await readFile(configPath, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  let selection: BuildResultRepositoryLocation["selection"];
  const implicit = text === undefined;
  if (text === undefined) {
    selection = { use: "@hypit/build-result-fs", config: { path: ".hypit/results" } };
  } else {
    const item = object(JSON.parse(text), "$results");
    exactKeys(item, ["format", "use", "config"], "$results");
    if (item.format !== "hypit.build-results@1") {
      throw new Error("$results.format must be hypit.build-results@1");
    }
    selection = {
      use: requiredString(item.use, "$results.use"),
      ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
    };
  }
  return { location: { root, selection }, implicit };
}

/** Diagnose the project-owned Result Store without reading Result history or mutating storage. */
export async function doctorProjectBuildResultRepository(
  projectRoot: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<ProjectBuildResultDoctorResult> {
  const root = resolve(projectRoot);
  let location: BuildResultRepositoryLocation | undefined;
  try {
    location = (await projectBuildResultLocation(root)).location;
    const registry = options.resultRegistry ?? new BuildResultRepositoryRegistry();
    await installBuildResultAdapter(
      registry,
      resolve(options.packageRoot ?? root),
      location.selection.use,
      options.distributionPackageRoot,
    );
    return {
      location,
      diagnostics: await registry.doctor(location.selection, location.root),
    };
  } catch (error) {
    return {
      ...(location === undefined ? {} : { location }),
      diagnostics: [{
        severity: "error",
        code: "RESULT_REPOSITORY_INVALID",
        message: error instanceof Error ? error.message : String(error),
        subject: resolve(root, "hypit.results.json"),
      }],
    };
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

function sameRef(
  left: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
  right: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function adapterContext(
  root: string,
  hostStateRoot: string,
  item: LocalRuntimeAdapterSelection,
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
  document: LocalRuntimeProfile,
  root: string,
  hostStateRoot: string,
  registry: RuntimeAdapterRegistry,
): Promise<readonly { readonly entry: LocalRuntimeAdapterSelection; readonly activation: RuntimeEndpointActivation }[]> {
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
  document: LocalRuntimeProfile,
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
  assertBuildId(build);
  const work = resolve(root, "work");
  const target = resolve(work, build);
  const relation = relative(work, target);
  if (relation.length === 0 || relation === ".." || relation.startsWith(`..${sep}`)) {
    throw new Error(`Build ${build} leaves Runtime work root ${work}`);
  }
  return target;
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
  const selectedEndpoints: Array<{ readonly item: LocalRuntimeAdapterSelection; readonly activation: RuntimeEndpointActivation }> = [];
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
    selectedEndpoints.push({ item, activation });
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
  if (selectedEndpoints.length > 0) {
    let stores: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
    try {
      stores = await openCredentialStores(document, root, hostStateRoot, registry);
      for (const { item, activation } of selectedEndpoints) {
        const credentials: Record<string, CredentialValue> = {};
        let missing = false;
        for (const slot of activation.endpoint.credentials) {
          const value = await stores.store.resolve(slot.ref);
          if (value !== undefined) {
            credentials[slot.slot] = value;
            continue;
          }
          missing = true;
          diagnostics.push({
            severity: "error",
            code: "RUNTIME_CREDENTIAL_MISSING",
            message: `${slot.label} for Endpoint ${slot.endpoint} is not configured. ${
              slot.ref.store === "env"
                ? `Set ${slot.ref.key} in this process environment.`
                : `Configure it with: hypit auth login ${slot.endpoint} --runtime ${absolute}`}`,
            subject: `${slot.endpoint}.${slot.slot}`,
          });
        }
        if (!options.active || missing || activation.diagnose === undefined) continue;
        try {
          const capabilities = (options.capabilities ?? activation.endpoint.offers.map((offer) => offer.capability))
            .filter((capability) => activation.endpoint.offers
              .some((offer) => capabilityKey(offer.capability) === capabilityKey(capability)));
          diagnostics.push(...await activation.diagnose({
            credentials,
            capabilities,
          }));
        } catch (error) {
          diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
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

/** Provider-owned price estimates for exact Needs. This may read remote rate cards but never submits work. */
export async function quoteRuntimeConfig(
  path: string,
  needs: readonly Need[],
  options: LoadRuntimeConfigOptions = {},
): Promise<readonly RuntimeHostNeedQuote[]> {
  if (needs.length === 0) return [];
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document), options.distributionPackageRoot);
  const endpoints = await activatedEndpoints(document, root, hostStateRoot, registry);
  let stores: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
  try {
    stores = await openCredentialStores(document, root, hostStateRoot, registry);
    return await Promise.all(needs.map(async (need): Promise<RuntimeHostNeedQuote> => {
      const matches = endpoints.flatMap(({ activation }) => activation.endpoint.offers
        .filter((offer) => sameRef(offer.capability, need.capability)
          && sameRef(offer.returns, need.returns)
          && (offer.supports?.(need) ?? true))
        .map((offer) => ({ activation, offer })));
      const base = { need: need.id, capability: structuredClone(need.capability) };
      if (matches.length === 0) return {
        ...base,
        quote: { status: "unknown", reason: "No selected Endpoint implements this exact Need" },
      };
      if (matches.length > 1) return {
        ...base,
        quote: {
          status: "unknown",
          reason: `Several selected Endpoints implement this Need: ${matches.map((item) => item.offer.endpoint).sort().join(", ")}`,
        },
      };
      const match = matches[0]!;
      if (match.offer.quote === undefined) return {
        ...base,
        endpoint: match.offer.endpoint,
        quote: { status: "unknown", reason: "The selected Provider does not expose a price estimate" },
      };
      const credentials: Record<string, CredentialValue> = {};
      for (const slot of match.activation.endpoint.credentials) {
        const value = await stores!.store.resolve(slot.ref);
        if (value === undefined) return {
          ...base,
          endpoint: match.offer.endpoint,
          quote: { status: "unknown", reason: `${slot.label} is not configured` },
        };
        credentials[slot.slot] = value;
      }
      try {
        return {
          ...base,
          endpoint: match.offer.endpoint,
          quote: await match.offer.quote({ need, credentials }),
        };
      } catch (error) {
        return {
          ...base,
          endpoint: match.offer.endpoint,
          quote: { status: "unknown", reason: error instanceof Error ? error.message : String(error) },
        };
      }
    }));
  } finally {
    await stores?.close();
  }
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const resultRegistry = options.resultRegistry ?? new BuildResultRepositoryRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document), options.distributionPackageRoot);
  const state = new SqliteRuntimeState(statePath(root));
  // Only selections that can change Command execution or an Operation handle are pinned until
  // every Build using them has left active Runtime state.
  const environmentConfig = canonicalStringify({
    credentials: document.credentials,
    endpoints: document.endpoints,
  });
  let credentials: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
  try {
    await state.environment.use(environmentConfig);
    credentials = await openCredentialStores(document, root, hostStateRoot, registry);
    const endpoints = await Promise.all(document.endpoints.map(async (item) => await registry.createEndpoint(
      item.use,
      adapterContext(root, hostStateRoot, { ...item, pool: item.pool ?? item.instance }),
    )));
    return await createLocalRuntime({
      buildStore: state.builds,
      buildCatalog: state.catalog,
      operationStore: state.operations,
      commandExecutionStore: state.commandExecutions,
      assertEnvironment: async () => {
        await state.environment.assert(environmentConfig);
        await options.assertExecutionOwner?.();
      },
      executionStore: state.execution,
      removeActiveBuild: async (build) => await state.removeActiveBuild(build),
      submissionStore: state.submissions,
      resourceStore: new FileResourceStore(resolve(root, "resources")),
      resourceStoreForBuild: (build) => new FileResourceStore(buildWorkPath(root, build)),
      clearBuildResources: async (build) => {
        await rm(buildWorkPath(root, build), { recursive: true, force: true });
      },
      openBuildResultRepository: async (location) => await openBuildResultLocation(location, options, packageRoot, resultRegistry),
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

export async function createRuntimeControlFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly readOnly?: boolean } = {},
): Promise<LocalRuntimeControl> {
  const { root } = await openRuntimeConfig(path, options.packageRoot);
  const state = new SqliteRuntimeState(statePath(root), { readOnly: options.readOnly === true });
  return createLocalRuntimeControl({
    buildStore: state.builds,
    buildCatalog: state.catalog,
    operationStore: state.operations,
    executionStore: state.execution,
    submissionStore: state.submissions,
    close: () => state.close(),
  });
}

export async function createRuntimeResultControlFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalResultWriter> {
  const { root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const state = new SqliteRuntimeState(statePath(root));
  const resultRegistry = options.resultRegistry ?? new BuildResultRepositoryRegistry();
  return createLocalResultWriter({
    buildStore: state.builds,
    operationStore: state.operations,
    commandExecutionStore: state.commandExecutions,
    executionStore: state.execution,
    removeActiveBuild: async (build) => await state.removeActiveBuild(build),
    submissionStore: state.submissions,
    resourceStore: new FileResourceStore(resolve(root, "resources")),
    resourceStoreForBuild: (build) => new FileResourceStore(buildWorkPath(root, build)),
    clearBuildResources: async (build) => {
      await rm(buildWorkPath(root, build), { recursive: true, force: true });
    },
    openBuildResultRepository: async (location) =>
      await openBuildResultLocation(location, options, packageRoot, resultRegistry),
    close: () => state.close(),
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
