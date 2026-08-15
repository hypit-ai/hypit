import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ComponentPackage } from "@narratage/component-kit";
import {
  collectNodePackageComponents,
  loadNodePackageSelection,
} from "@narratage/package-loader-node";
import type { LoadedPackage, NodePackageSelectionRequest } from "@narratage/package-loader-node";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { CanonicalValue, CapabilityRef } from "@narratage/protocol";
import {
  isRuntimeAdapterHostFacet,
  runtimeEndpointAdapterHostAbi,
  runtimeInfrastructureHostAbi,
  RuntimeAdapterRegistry,
} from "@narratage/runtime-kit";
import type {
  RuntimeDoctorDiagnostic,
  RuntimeEndpointActivation,
  ManagedProgram,
  ManagedProgramState,
} from "@narratage/runtime-kit";
import {
  CompositeCredentialStore,
  verifyRuntimeInfrastructurePackage,
} from "@narratage/runtime";
import type {
  RuntimeInfrastructurePackage,
  RuntimePartReference,
  RuntimeRoleSelection,
} from "@narratage/runtime";

import type { LocalRuntime } from "./types.js";
import type { LocalCredentialControl } from "./types.js";
import type {
  LocalRuntimeArchiveControl,
  LocalRuntimeArtifactAccess,
  LocalRuntimeControl,
} from "./types.js";

export type RuntimeConfigEntry = {
  readonly use: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config?: CanonicalValue;
};

export type RuntimeConfigDocument = {
  readonly format: "narratage.runtime-profile@1";
  readonly runtimeUse: string;
  /** Private deployment state, resolved relative to the Profile. */
  readonly dataRoot: string;
  /** Replaceable parts of the Runtime itself. One package may fill several roles. */
  readonly infrastructure: readonly RuntimeConfigEntry[];
  readonly roles: RuntimeRoleSelection;
  readonly endpoints: readonly RuntimeConfigEntry[];
  readonly capacity: {
    readonly maxConcurrency: number;
    readonly resources?: Readonly<Record<string, number>>;
  };
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${subject} does not accept ${unknown[0]}`);
}

function optionalString(value: unknown, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function requiredString(value: unknown, subject: string): string {
  const result = optionalString(value, subject);
  if (result === undefined) throw new Error(`${subject} is required`);
  return result;
}

function positiveInteger(value: unknown, subject: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${subject} must be a positive integer`);
  return value as number;
}

function stringList(value: unknown, subject: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array`);
  const items = value.map((item, index) => optionalString(item, `${subject}[${index}]`)!);
  if (new Set(items).size !== items.length) throw new Error(`${subject} contains duplicates`);
  return items;
}

function entry(value: unknown, instance: string, subject: string, poolAllowed: boolean): RuntimeConfigEntry {
  const item = object(value, subject);
  exactKeys(item, poolAllowed ? ["use", "pool", "config"] : ["use", "config"], subject);
  const pool = poolAllowed ? optionalString(item.pool, `${subject}.pool`) : undefined;
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance,
    ...(pool === undefined ? {} : { pool }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}


function capacity(value: unknown): RuntimeConfigDocument["capacity"] {
  if (value === undefined) throw new Error("$runtime.runtime.config.capacity is required");
  const item = object(value, "$runtime.runtime.config.capacity");
  exactKeys(item, ["maxActiveOperations", "resources"], "$runtime.runtime.config.capacity");
  const resources = item.resources === undefined ? undefined : object(item.resources, "$runtime.runtime.config.capacity.resources");
  const normalizedResources = resources === undefined ? undefined : Object.fromEntries(Object.entries(resources).map(([name, limit]) => {
    if (name.trim().length === 0) throw new Error("Runtime resource id must not be empty");
    return [name, positiveInteger(limit, `$runtime.runtime.config.capacity.resources.${name}`)!];
  }));
  const maxConcurrency = positiveInteger(item.maxActiveOperations,
    "$runtime.runtime.config.capacity.maxActiveOperations");
  if (maxConcurrency === undefined) {
    throw new Error("$runtime.runtime.config.capacity.maxActiveOperations is required");
  }
  return {
    maxConcurrency,
    ...(normalizedResources === undefined ? {} : { resources: normalizedResources }),
  };
}

function partReference(value: unknown, subject: string): RuntimePartReference {
  const item = object(value, subject);
  exactKeys(item, ["from", "part"], subject);
  return {
    from: requiredString(item.from, `${subject}.from`),
    part: requiredString(item.part, `${subject}.part`),
  };
}

function partReferences(value: unknown, subject: string): readonly RuntimePartReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array`);
  const references = value.map((item, index) => partReference(item, `${subject}[${index}]`));
  const keys = references.map((item) => `${item.from}\u0000${item.part}`);
  if (new Set(keys).size !== keys.length) throw new Error(`${subject} contains duplicates`);
  return references;
}

function roleSelection(value: unknown): RuntimeRoleSelection {
  const subject = "$runtime.runtime.config.roles";
  const item = object(value, subject);
  exactKeys(item, [
    "scheduler", "worker", "buildStore", "operationStore", "dispatchStore", "artifactStore", "credentialStores",
  ], subject);
  return {
    scheduler: partReference(item.scheduler, `${subject}.scheduler`),
    worker: partReference(item.worker, `${subject}.worker`),
    buildStore: partReference(item.buildStore, `${subject}.buildStore`),
    operationStore: partReference(item.operationStore, `${subject}.operationStore`),
    dispatchStore: partReference(item.dispatchStore, `${subject}.dispatchStore`),
    artifactStore: partReference(item.artifactStore, `${subject}.artifactStore`),
    credentialStores: partReferences(item.credentialStores, `${subject}.credentialStores`),
  };
}

function entries(value: unknown, subject: string, poolAllowed: boolean): readonly RuntimeConfigEntry[] {
  const configured = object(value, subject);
  return Object.entries(configured).map(([instance, item]) => {
    if (instance.trim().length === 0) throw new Error(`${subject} contains an empty instance name`);
    return entry(item, instance, `${subject}.${instance}`, poolAllowed);
  });
}

export function parseRuntimeConfig(value: unknown): RuntimeConfigDocument {
  const item = object(value, "$runtime");
  exactKeys(item, ["format", "runtime"], "$runtime");
  if (item.format !== "narratage.runtime-profile@1") {
    throw new Error("$runtime.format must be narratage.runtime-profile@1");
  }
  const runtime = object(item.runtime, "$runtime.runtime");
  exactKeys(runtime, ["use", "config"], "$runtime.runtime");
  const runtimeUse = requiredString(runtime.use, "$runtime.runtime.use");
  if (runtimeUse !== "@narratage/runtime-local") throw new Error(`Local Runtime loader cannot activate ${runtimeUse}`);
  const config = object(runtime.config, "$runtime.runtime.config");
  exactKeys(config, ["dataRoot", "infrastructure", "roles", "endpoints", "capacity"], "$runtime.runtime.config");
  const infrastructure = entries(config.infrastructure, "$runtime.runtime.config.infrastructure", false);
  const endpoints = config.endpoints === undefined
    ? []
    : entries(config.endpoints, "$runtime.runtime.config.endpoints", true);
  const instances = [...infrastructure, ...endpoints].map((value) => value.instance);
  if (new Set(instances).size !== instances.length) throw new Error("$runtime repeats a Runtime instance id");
  return {
    format: "narratage.runtime-profile@1",
    runtimeUse,
    dataRoot: requiredString(config.dataRoot, "$runtime.runtime.config.dataRoot"),
    infrastructure,
    roles: roleSelection(config.roles),
    endpoints,
    capacity: capacity(config.capacity),
  };
}

export type LoadRuntimeConfigOptions = {
  /** Trusted embedding adapters supplied directly by an embedding application. */
  readonly registry?: RuntimeAdapterRegistry;
  readonly components?: readonly ComponentPackage[];
  /** Host package installation used when the Profile does not explicitly select packageRoot. */
  readonly packageRoot?: string;
  /** Package set already verified by this same Host command. */
  readonly implementationPackages?: readonly LoadedPackage[];
  /** Observation-only assembly must not initialize absent durable state. */
  readonly readOnly?: boolean;
};

export type RuntimeConfigDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

export type ResolvedRuntimeConfigPaths = {
  readonly packageRoot: string;
  readonly dataRoot: string;
};

type OpenedRuntimeConfig = {
  readonly absolute: string;
  readonly document: RuntimeConfigDocument;
  readonly profileRoot: string;
  readonly root: string;
  readonly packageRoot: string;
};

async function openRuntimeConfig(
  path: string,
  packageRootHint?: string,
): Promise<OpenedRuntimeConfig> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const profileRoot = dirname(absolute);
  return {
    absolute,
    document,
    profileRoot,
    root: resolve(profileRoot, document.dataRoot),
    packageRoot: resolve(packageRootHint ?? profileRoot),
  };
}

function runtimePackageSelection(document: RuntimeConfigDocument): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [
      ...document.infrastructure.map((item) => ({ abi: runtimeInfrastructureHostAbi, name: item.use })),
      ...document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterHostAbi, name: item.use })),
    ],
  };
}

/**
 * Resolve Runtime-owned paths without constructing infrastructure or Endpoints.
 */
export async function resolveRuntimeConfigPaths(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<ResolvedRuntimeConfigPaths> {
  const { root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  return {
    packageRoot,
    dataRoot: root,
  };
}

/** Deployment revision understood only by this Runtime Profile implementation. */
export async function runtimeConfigRevision(path: string): Promise<string> {
  const { document } = await openRuntimeConfig(path);
  return digestOf(canonicalize({
    format: "narratage.runtime-profile-revision@1",
    document,
  }));
}

async function installRuntimeAdapters(
  registry: RuntimeAdapterRegistry,
  packageRoot: string,
  selected: readonly string[] | NodePackageSelectionRequest,
): Promise<void> {
  const request: NodePackageSelectionRequest = Array.isArray(selected)
    ? { selected }
    : selected as NodePackageSelectionRequest;
  const logical = (request.logical ?? []).filter((address) => {
    if (address.abi === runtimeEndpointAdapterHostAbi) return !registry.has(address.name, "endpoint");
    if (address.abi === runtimeInfrastructureHostAbi) return !registry.has(address.name, "infrastructure");
    return true;
  });
  if (request.selected.length === 0 && logical.length === 0) return;
  const loaded = await loadNodePackageSelection({ selected: request.selected, logical }, packageRoot);
  for (const loadedPackage of loaded) {
    const contribution = loadedPackage.contribution;
    for (const facet of contribution.hostFacets ?? []) {
      if (!isRuntimeAdapterHostFacet(facet)) continue;
      registry.registerFacet(facet);
    }
  }
}

/** One Endpoint's declaration of an external program its Provider drives. */
type DeclaredManagedProgram = {
  readonly instance: string;
  readonly program: ManagedProgram;
};

function sameCapability(left: CapabilityRef, right: CapabilityRef): boolean {
  return left.name === right.name
    && left.module.name === right.module.name
    && left.module.version === right.module.version;
}

/**
 * The external programs a Runtime Profile implies, in the order it declares
 * them. Two Endpoints may name the same program — one WhisperX serves every
 * Provider instance pointed at it — so callers that act on these deduplicate
 * by `program.id` and act once.
 */
export async function declaredManagedPrograms(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly DeclaredManagedProgram[] }> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  // A Build with no demanded external capability has no program to discover.
  // Keep validating the Profile document and its root, but do not load the
  // privileged Runtime package closure merely to prove that the empty set is
  // empty. `programs up/status/down` omit this filter and still inspect every
  // declared program.
  if (options.capabilities?.length === 0) return { dataRoot: root, programs: [] };
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(
    registry,
    packageRoot,
    runtimePackageSelection(document),
  );
  const programs: DeclaredManagedProgram[] = [];
  for (const item of document.endpoints) {
    if (!registry.has(item.use, "endpoint")) {
      throw new Error(`Runtime Adapter ${item.use} is not registered`);
    }
    const activation = await registry.activateEndpoint(item.use, {
      dataRoot: root,
      instance: item.instance,
      pool: item.pool ?? item.instance,
      config: item.config ?? {},
    });
    if (options.capabilities !== undefined && !activation.endpoint.offers.some((offer) =>
      options.capabilities!.some((capability) => sameCapability(offer.capability, capability)))) {
      continue;
    }
    const program = activation.program;
    if (program !== undefined) programs.push({ instance: item.instance, program });
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

/** Read-only validation of package bytes, adapter config, credentials and local executable prerequisites. */
export async function doctorRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<RuntimeConfigDoctorResult> {
  const { absolute, document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const diagnostics: RuntimeDoctorDiagnostic[] = [];
  const credentialEndpoints: Array<{
    readonly entry: RuntimeConfigEntry;
    readonly activation: RuntimeEndpointActivation;
  }> = [];
  const coveredCapabilities = new Set<string>();
  const capabilityKey = (capability: CapabilityRef) =>
    `${capability.module.name}@${capability.module.version}#${capability.name}`;
  try {
    if (!(await stat(root)).isDirectory()) throw new Error(`Runtime root ${root} is not a directory`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // Observation is allowed before the selected Runtime has created private state.
    } else {
      diagnostics.push(diagnostic(error, "RUNTIME_DATA_ROOT_INVALID", root));
      return { dataRoot: root, diagnostics };
    }
  }
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const runtimePackages = installRuntimeAdapters(
    registry,
    packageRoot,
    runtimePackageSelection(document),
  );
  const [runtimeResult] = await Promise.allSettled([runtimePackages]);
  if (runtimeResult.status === "rejected") {
    diagnostics.push(diagnostic(runtimeResult.reason, "RUNTIME_PACKAGE_SELECTION_INVALID"));
    return { dataRoot: root, diagnostics };
  }
  for (const item of document.infrastructure) {
    const context = { dataRoot: root, instance: item.instance, config: item.config ?? {} };
    try {
      const selection = registry.validate(item.use, "infrastructure", context);
      diagnostics.push(...selection);
      if (selection.some((entry) => entry.severity === "error")) continue;
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_COMPONENT_CONFIG_INVALID", item.instance));
      continue;
    }
    try {
      diagnostics.push(...await registry.doctor(item.use, "infrastructure", context));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
    }
  }
  for (const item of document.endpoints) {
    const context = {
      dataRoot: root,
      instance: item.instance,
      pool: item.pool ?? item.instance,
      config: item.config ?? {},
    };
    let activation: RuntimeEndpointActivation;
    try {
      activation = await registry.activateEndpoint(item.use, context);
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ENDPOINT_CONFIG_INVALID", item.instance));
      continue;
    }
    if (options.capabilities !== undefined && !activation.endpoint.offers.some((offer) =>
      options.capabilities!.some((capability) => sameCapability(offer.capability, capability)))) {
      continue;
    }
    for (const offer of activation.endpoint.offers) {
      if (options.capabilities?.some((capability) => sameCapability(offer.capability, capability))) {
        coveredCapabilities.add(capabilityKey(offer.capability));
      }
    }
    let adapterHasError = false;
    try {
      const adapterDiagnostics = activation.diagnose === undefined ? [] : await activation.diagnose();
      diagnostics.push(...adapterDiagnostics);
      adapterHasError = adapterDiagnostics.some((entry) => entry.severity === "error");
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
      continue;
    }
    if (adapterHasError) continue;
    credentialEndpoints.push({ entry: item, activation });
    // A Managed Program is a prerequisite a Build cannot supply for itself, so
    // name the command that supplies it here rather than failing mid-Build on a
    // socket. This is the separate process a deployment must have installed or running.
    let program: ManagedProgram | undefined;
    try {
      program = activation.program;
    } catch (error) {
      diagnostics.push(diagnostic(error, "MANAGED_PROGRAM_INVALID", item.instance));
    }
    if (program === undefined) continue;
    let state: ManagedProgramState;
    try {
      state = await program.probe();
    } catch (error) {
      diagnostics.push(diagnostic(error, "MANAGED_PROGRAM_PROBE_FAILED", program.id));
      continue;
    }
    if (state.state === "down") {
      diagnostics.push({
        severity: "error",
        code: "MANAGED_PROGRAM_DOWN",
        message: `${program.id} is not usable: ${state.detail}.${
          program.start === undefined && program.prepare === undefined
            ? ""
            : " Bring it up with: narratage programs up"}`,
        subject: program.id,
      });
    } else if (state.state === "mismatch") {
      diagnostics.push({
        severity: "error",
        code: "MANAGED_PROGRAM_MISMATCH",
        message: `${program.id} is running but differs from this Runtime Profile: ${state.detail}`,
        subject: program.id,
      });
    }
  }
  for (const capability of options.capabilities ?? []) {
    if (coveredCapabilities.has(capabilityKey(capability))) continue;
    diagnostics.push({
      severity: "error",
      code: "RUNTIME_CAPABILITY_UNBOUND",
      message: `No usable Endpoint in this Runtime Profile fulfills ${capabilityKey(capability)}`,
      subject: capabilityKey(capability),
    });
  }
  if (credentialEndpoints.length > 0) {
    let packages: readonly RuntimeInfrastructurePackage[] = [];
    try {
      const endpoints = credentialEndpoints.map(({ entry, activation }) => ({
        entry,
        credentials: activation.endpoint.credentials,
      }));
      if (endpoints.every((item) => item.credentials.length === 0)) return { dataRoot: root, diagnostics };
      const serviceEntries = runtimeEntriesForParts(
        document.infrastructure,
        document.roles.credentialStores,
      );
      packages = await Promise.all(serviceEntries.map(async (item) => await registry.createInfrastructure(item.use, {
        dataRoot: root,
        instance: item.instance,
        config: item.config ?? {},
      })));
      for (const item of packages) verifyRuntimeInfrastructurePackage(item);
      const byPart = new Map(packages.flatMap((item) =>
        item.parts.map((component) => [`${component.owner}\u0000${component.part}`, component] as const)));
      const stores = document.roles.credentialStores.map((reference) => {
        const component = byPart.get(`${reference.from}\u0000${reference.part}`);
        if (component === undefined) {
          throw new Error(`CredentialStore role refers to unknown part ${reference.from}.${reference.part}`);
        }
        if (component.role !== "credential-store") {
          throw new Error(`Runtime part ${reference.from}.${reference.part} is ${component.role}, not credential-store`);
        }
        return component.port;
      });
      const credentials = new CompositeCredentialStore(stores);
      for (const { entry, credentials: slots } of endpoints) {
        for (const slot of slots) {
          if (await credentials.resolve(slot.ref) !== undefined) continue;
          diagnostics.push({
            severity: "error",
            code: "RUNTIME_CREDENTIAL_MISSING",
            message: `${slot.label} for Endpoint ${entry.instance} is not configured in CredentialStore ${slot.ref.store}. `
              + (slot.ref.store === "env"
                ? `Set ${slot.ref.key} in this process environment, or select a writable CredentialStore in the Runtime Profile.`
                : `Configure it with: narratage auth login ${entry.instance} --runtime ${absolute}`),
            subject: `${entry.instance}.${slot.slot}`,
          });
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_CREDENTIAL_CHECK_FAILED"));
    } finally {
      await closeRuntimeInfrastructurePackages(packages);
    }
  }
  return { dataRoot: root, diagnostics };
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  // Diagnostics and lifecycle discovery must not initialize SQLite, Drivers or Endpoints.
  // Load the executable Runtime assembly only on the command that actually constructs it.
  const { createProjectLocalRuntime } = await import("./runtime.js");
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await Promise.all([
    installRuntimeAdapters(
      registry,
      packageRoot,
      runtimePackageSelection(document),
    ),
  ]);
  const infrastructure = await Promise.all(document.infrastructure.map(async (item) => {
    return await registry.createInfrastructure(item.use, {
      dataRoot: root,
      instance: item.instance,
      config: item.config ?? {},
    });
  }));
  const endpoints = await Promise.all(document.endpoints.map(async (item) => {
    return await registry.createEndpoint(item.use, {
      dataRoot: root,
      instance: item.instance,
      pool: item.pool ?? item.instance,
      config: item.config ?? {},
    });
  }));
  return await createProjectLocalRuntime({
    dataRoot: root,
    packageRoot,
    infrastructure,
    roles: document.roles,
    components: [
      ...collectNodePackageComponents((options.implementationPackages ?? []).map((item) => item.contribution)),
      ...(options.components ?? []),
    ],
    endpoints,
    scheduling: document.capacity,
  });
}

async function createSelectedRuntimeInfrastructure(
  document: RuntimeConfigDocument,
  root: string,
  packageRoot: string,
  registry: RuntimeAdapterRegistry,
  references: readonly RuntimePartReference[],
  readOnly: boolean,
): Promise<readonly RuntimeInfrastructurePackage[]> {
  const serviceEntries = runtimeEntriesForParts(document.infrastructure, references);
  await installRuntimeAdapters(registry, packageRoot, {
    selected: [],
    logical: serviceEntries.map((item) => ({ abi: runtimeInfrastructureHostAbi, name: item.use })),
  });
  const packages: RuntimeInfrastructurePackage[] = [];
  try {
    for (const item of serviceEntries) {
      packages.push(await registry.createInfrastructure(item.use, {
        dataRoot: root,
        instance: item.instance,
        config: item.config ?? {},
        access: readOnly ? "read-only" : "read-write",
      }));
    }
    return packages;
  } catch (error) {
    await closeRuntimeInfrastructurePackages(packages);
    throw error;
  }
}

/** Open Build, Operation and Dispatch state without constructing an ArtifactStore. */
export async function createRuntimeArchiveFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeArchiveControl> {
  const { createProjectLocalRuntimeArchiveControl } = await import("./control.js");
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const infrastructure = await createSelectedRuntimeInfrastructure(document, root, packageRoot, registry, [
    document.roles.buildStore,
    document.roles.operationStore,
    document.roles.dispatchStore,
  ], options.readOnly === true);
  return await createProjectLocalRuntimeArchiveControl({
    dataRoot: root,
    infrastructure,
    roles: document.roles,
  });
}

/** Open only the ArtifactStore selected by a Runtime Profile. */
export async function createRuntimeArtifactAccessFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeArtifactAccess> {
  const { createProjectLocalRuntimeArtifactAccess } = await import("./control.js");
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const infrastructure = await createSelectedRuntimeInfrastructure(document, root, packageRoot, registry, [
    document.roles.artifactStore,
  ], options.readOnly === true);
  return await createProjectLocalRuntimeArtifactAccess({
    dataRoot: root,
    infrastructure,
    roles: document.roles,
  });
}

/** Open state plus Artifacts only for explicit cross-store maintenance such as GC. */
export async function createRuntimeMaintenanceFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeControl> {
  const { createProjectLocalRuntimeControl } = await import("./control.js");
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const infrastructure = await createSelectedRuntimeInfrastructure(document, root, packageRoot, registry, [
    document.roles.buildStore,
    document.roles.operationStore,
    document.roles.dispatchStore,
    document.roles.artifactStore,
  ], options.readOnly === true);
  return await createProjectLocalRuntimeControl({
    dataRoot: root,
    infrastructure,
    roles: document.roles,
  });
}

function runtimeEntriesForParts(
  entries: readonly RuntimeConfigEntry[],
  references: readonly RuntimePartReference[],
): readonly RuntimeConfigEntry[] {
  const selected = new Set<RuntimeConfigEntry>();
  for (const reference of references) {
    const owner = entries.find((entry) => entry.instance === reference.from);
    if (owner === undefined) {
      throw new Error(`Runtime role refers to unknown infrastructure instance ${reference.from}`);
    }
    selected.add(owner);
  }
  return [...selected];
}

async function closeRuntimeInfrastructurePackages(packages: readonly RuntimeInfrastructurePackage[]): Promise<void> {
  for (const item of [...packages].reverse()) await item.close?.();
}

/**
 * Open the smallest deployment slice required to manage one exact Endpoint's
 * credentials. Build Stores, scheduler, Worker, author packages and unrelated
 * Endpoints are deliberately not constructed.
 */
export async function createRuntimeCredentialsFromConfig(
  path: string,
  endpointInstance: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalCredentialControl> {
  const { createLocalCredentialControl } = await import("./credentials.js");
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const endpointEntry = document.endpoints.find((item) => item.instance === endpointInstance);
  if (endpointEntry === undefined) throw new Error(`Runtime Profile has no Endpoint instance ${endpointInstance}`);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const serviceEntries = runtimeEntriesForParts(
    document.infrastructure,
    document.roles.credentialStores,
  );
  await installRuntimeAdapters(registry, packageRoot, {
    selected: [],
    logical: [
      { abi: runtimeEndpointAdapterHostAbi, name: endpointEntry.use },
      ...serviceEntries.map((item) => ({ abi: runtimeInfrastructureHostAbi, name: item.use })),
    ],
  });
  const packages = await Promise.all(serviceEntries.map(async (item) => await registry.createInfrastructure(item.use, {
    dataRoot: root,
    instance: item.instance,
    config: item.config ?? {},
  })));
  try {
    for (const item of packages) verifyRuntimeInfrastructurePackage(item);
    const byPart = new Map(packages.flatMap((item) => item.parts
      .map((component) => [`${component.owner}\u0000${component.part}`, component] as const)));
    const credentialStores = document.roles.credentialStores.map((reference) => {
      const component = byPart.get(`${reference.from}\u0000${reference.part}`);
      if (component === undefined) {
        throw new Error(`CredentialStore role refers to unknown part ${reference.from}.${reference.part}`);
      }
      if (component.role !== "credential-store") {
        throw new Error(`Runtime part ${reference.from}.${reference.part} is ${component.role}, not credential-store`);
      }
      return component.port;
    });
    const endpoint = await registry.createEndpoint(endpointEntry.use, {
      dataRoot: root,
      instance: endpointEntry.instance,
      pool: endpointEntry.pool ?? endpointEntry.instance,
      config: endpointEntry.config ?? {},
    });
    return createLocalCredentialControl({
      credentialStore: new CompositeCredentialStore(credentialStores),
      endpoints: [endpoint],
      close: async () => await closeRuntimeInfrastructurePackages(packages),
    });
  } catch (error) {
    await closeRuntimeInfrastructurePackages(packages);
    throw error;
  }
}
