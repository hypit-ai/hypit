import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ComponentPackage } from "@narratage/component-kit";
import {
  collectNodePackageComponents,
  loadNodePackageSelection,
  loadNodePackageSet,
  readNodePackageLock,
} from "@narratage/package-loader-node";
import type { LoadedNodePackageSet, NodePackageSelectionRequest } from "@narratage/package-loader-node";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { CanonicalValue, CapabilityRef } from "@narratage/protocol";
import {
  isRuntimeAdapterHostFacet,
  runtimeEndpointAdapterHostAbi,
  runtimeComponentAdapterHostAbi,
  RuntimeAdapterRegistry,
} from "@narratage/runtime-adapter";
import type {
  RuntimeDoctorDiagnostic,
  RuntimeEndpointActivation,
  ManagedProgram,
  ManagedProgramState,
} from "@narratage/runtime-adapter";
import {
  CompositeCredentialStore,
  verifyRuntimeComponentPackage,
} from "@narratage/runtime";
import type { RuntimeComponentPackage, RuntimeBindings } from "@narratage/runtime";

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
  readonly authority?: string;
  readonly config?: CanonicalValue;
};

export type RuntimeConfigDocument = {
  readonly format: "narratage.runtime-profile@1";
  readonly runtimeUse: string;
  /** Private deployment state, resolved relative to the Profile. */
  readonly dataRoot: string;
  /** Locked physical packages allowed to configure privileged Runtime adapters. */
  readonly runtimePackageLock?: string;
  /** Replaceable parts of the Runtime itself. One package may fill several roles. */
  readonly components: readonly RuntimeConfigEntry[];
  readonly bindings: RuntimeBindings;
  readonly endpoints: readonly RuntimeConfigEntry[];
  readonly limits: {
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

function entry(value: unknown, instance: string, subject: string, authorityRequired: boolean): RuntimeConfigEntry {
  const item = object(value, subject);
  exactKeys(item, authorityRequired ? ["use", "authority", "config"] : ["use", "config"], subject);
  const authority = authorityRequired ? optionalString(item.authority, `${subject}.authority`) : undefined;
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance,
    ...(authority === undefined ? {} : { authority }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}


function limits(value: unknown): RuntimeConfigDocument["limits"] {
  if (value === undefined) throw new Error("$runtime.runtime.config.limits is required");
  const item = object(value, "$runtime.runtime.config.limits");
  exactKeys(item, ["maxOperations", "resources"], "$runtime.runtime.config.limits");
  const resources = item.resources === undefined ? undefined : object(item.resources, "$runtime.runtime.config.limits.resources");
  const normalizedResources = resources === undefined ? undefined : Object.fromEntries(Object.entries(resources).map(([name, limit]) => {
    if (name.trim().length === 0) throw new Error("Runtime resource id must not be empty");
    return [name, positiveInteger(limit, `$runtime.runtime.config.limits.resources.${name}`)!];
  }));
  const maxConcurrency = positiveInteger(item.maxOperations, "$runtime.runtime.config.limits.maxOperations");
  if (maxConcurrency === undefined) throw new Error("$runtime.runtime.config.limits.maxOperations is required");
  return {
    maxConcurrency,
    ...(normalizedResources === undefined ? {} : { resources: normalizedResources }),
  };
}

function serviceSelection(value: unknown): RuntimeBindings {
  const item = object(value, "$runtime.runtime.config.bindings");
  exactKeys(item, ["scheduler", "worker", "stores"], "$runtime.runtime.config.bindings");
  const stores = object(item.stores, "$runtime.runtime.config.bindings.stores");
  exactKeys(stores, ["build", "operations", "dispatch", "artifacts", "credentials"],
    "$runtime.runtime.config.bindings.stores");
  const credentials = stringList(stores.credentials, "$runtime.runtime.config.bindings.stores.credentials");
  return {
    scheduler: requiredString(item.scheduler, "$runtime.runtime.config.bindings.scheduler"),
    worker: requiredString(item.worker, "$runtime.runtime.config.bindings.worker"),
    stores: {
      build: requiredString(stores.build, "$runtime.runtime.config.bindings.stores.build"),
      operations: requiredString(stores.operations, "$runtime.runtime.config.bindings.stores.operations"),
      dispatch: requiredString(stores.dispatch, "$runtime.runtime.config.bindings.stores.dispatch"),
      artifacts: requiredString(stores.artifacts, "$runtime.runtime.config.bindings.stores.artifacts"),
      credentials,
    },
  };
}

function entries(value: unknown, subject: string, authorityRequired: boolean): readonly RuntimeConfigEntry[] {
  const configured = object(value, subject);
  return Object.entries(configured).map(([instance, item]) => {
    if (instance.trim().length === 0) throw new Error(`${subject} contains an empty instance name`);
    return entry(item, instance, `${subject}.${instance}`, authorityRequired);
  });
}

export function parseRuntimeConfig(value: unknown): RuntimeConfigDocument {
  const item = object(value, "$runtime");
  exactKeys(item, ["format", "runtimePackageLock", "runtime"], "$runtime");
  if (item.format !== "narratage.runtime-profile@1") {
    throw new Error("$runtime.format must be narratage.runtime-profile@1");
  }
  const runtime = object(item.runtime, "$runtime.runtime");
  exactKeys(runtime, ["use", "config"], "$runtime.runtime");
  const runtimeUse = requiredString(runtime.use, "$runtime.runtime.use");
  if (runtimeUse !== "@narratage/local") throw new Error(`Local Runtime loader cannot activate ${runtimeUse}`);
  const config = object(runtime.config, "$runtime.runtime.config");
  exactKeys(config, ["dataRoot", "components", "bindings", "endpoints", "limits"], "$runtime.runtime.config");
  const components = entries(config.components, "$runtime.runtime.config.components", false);
  const endpoints = config.endpoints === undefined
    ? []
    : entries(config.endpoints, "$runtime.runtime.config.endpoints", true);
  const instances = [...components, ...endpoints].map((value) => value.instance);
  if (new Set(instances).size !== instances.length) throw new Error("$runtime repeats a Runtime instance id");
  return {
    format: "narratage.runtime-profile@1",
    runtimeUse,
    dataRoot: requiredString(config.dataRoot, "$runtime.runtime.config.dataRoot"),
    ...(optionalString(item.runtimePackageLock, "$runtime.runtimePackageLock") === undefined
      ? {}
      : { runtimePackageLock: item.runtimePackageLock as string }),
    components,
    bindings: serviceSelection(config.bindings),
    endpoints,
    limits: limits(config.limits),
  };
}

export type LoadRuntimeConfigOptions = {
  /** Trusted embedding adapters. Locked installed adapters are normally selected by runtimePackageLock. */
  readonly registry?: RuntimeAdapterRegistry;
  readonly components?: readonly ComponentPackage[];
  /** Host package installation used when the Profile does not explicitly select packageRoot. */
  readonly packageRoot?: string;
  /** Package set already verified by this same Host command. */
  readonly implementationPackages?: LoadedNodePackageSet;
  /** Observation-only assembly must not initialize absent durable state. */
  readonly readOnly?: boolean;
};

export type RuntimeConfigDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

export type RuntimeConfigPackageSelection = {
  readonly packageRoot: string;
  readonly dataRoot: string;
  readonly runtimePackageLock?: string;
  /** Logical Runtime adapters selected by kind and use name. */
  readonly runtimeSelection: NodePackageSelectionRequest;
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
      ...document.components.map((item) => ({ abi: runtimeComponentAdapterHostAbi, name: item.use })),
      ...document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterHostAbi, name: item.use })),
    ],
  };
}

/**
 * Resolve the deterministic implementation lock selected by a Runtime Profile
 * without constructing the Runtime or executing any adapter code.
 *
 * The CLI uses this to keep `build --runtime <profile>` single-sourced: the
 * same author package lock drives compilation and later Worker execution.
 */
export async function runtimeConfigPackageSelection(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfigPackageSelection> {
  const { document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  return {
    packageRoot,
    dataRoot: root,
    runtimeSelection: runtimePackageSelection(document),
    ...(document.runtimePackageLock === undefined
      ? {}
      : { runtimePackageLock: resolve(profileRoot, document.runtimePackageLock) }),
  };
}

/** Deployment revision understood only by this Runtime Profile implementation. */
export async function runtimeConfigRevision(path: string): Promise<string> {
  const { document, profileRoot } = await openRuntimeConfig(path);
  const locks: Record<string, string> = {};
  for (const [name, value] of [["runtimePackageLock", document.runtimePackageLock]] as const) {
    if (value === undefined) continue;
    locks[name] = (await readNodePackageLock(resolve(profileRoot, value))).digest;
  }
  return digestOf(canonicalize({
    format: "narratage.runtime-profile-revision@1",
    document,
    locks,
  }));
}

async function installLockedRuntimeAdapters(
  registry: RuntimeAdapterRegistry,
  path: string | undefined,
  lockRoot: string,
  packageRoot: string,
  selected?: readonly string[] | NodePackageSelectionRequest,
): Promise<void> {
  if (path === undefined) return;
  const loaded = selected === undefined
    ? await loadNodePackageSet(resolve(lockRoot, path), packageRoot)
    : await loadNodePackageSelection(resolve(lockRoot, path), selected, packageRoot);
  const lockedPackages = new Map(loaded.lock.packages.map((item) => [item.package.name, item]));
  for (const loadedPackage of loaded.packages) {
    const contribution = loadedPackage.contribution;
    const locked = lockedPackages.get(loadedPackage.specifier);
    if (locked === undefined) throw new Error(`Runtime package ${loadedPackage.specifier} is absent from its verified lock`);
    for (const facet of contribution.hostFacets ?? []) {
      if (!isRuntimeAdapterHostFacet(facet)) continue;
      registry.registerFacet(facet, {
        closureDigest: locked.closureDigest,
      });
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
  const { document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  // A Build with no demanded external capability has no program to discover.
  // Keep validating the Profile document and its root, but do not load the
  // privileged Runtime package closure merely to prove that the empty set is
  // empty. `programs up/status/down` omit this filter and still inspect every
  // declared program.
  if (options.capabilities?.length === 0) return { dataRoot: root, programs: [] };
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installLockedRuntimeAdapters(
    registry,
    document.runtimePackageLock,
    profileRoot,
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
      authority: item.authority ?? item.instance,
      config: item.config ?? {},
    });
    if (options.capabilities !== undefined && !activation.endpoint.bindings.some((binding) =>
      options.capabilities!.some((capability) => sameCapability(binding.capability, capability)))) {
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
  const { absolute, document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
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
  const runtimeLock = installLockedRuntimeAdapters(
    registry,
    document.runtimePackageLock,
    profileRoot,
    packageRoot,
    runtimePackageSelection(document),
  );
  const [runtimeResult] = await Promise.allSettled([runtimeLock]);
  if (runtimeResult.status === "rejected") {
    diagnostics.push(diagnostic(runtimeResult.reason, "RUNTIME_PACKAGE_LOCK_INVALID", document.runtimePackageLock));
    return { dataRoot: root, diagnostics };
  }
  for (const item of document.components) {
    const context = { dataRoot: root, instance: item.instance, config: item.config ?? {} };
    try {
      const selection = registry.validate(item.use, "runtime-component", context);
      diagnostics.push(...selection);
      if (selection.some((entry) => entry.severity === "error")) continue;
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_COMPONENT_CONFIG_INVALID", item.instance));
      continue;
    }
    try {
      diagnostics.push(...await registry.doctor(item.use, "runtime-component", context));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
    }
  }
  for (const item of document.endpoints) {
    const context = {
      dataRoot: root,
      instance: item.instance,
      authority: item.authority ?? item.instance,
      config: item.config ?? {},
    };
    let activation: RuntimeEndpointActivation;
    try {
      activation = await registry.activateEndpoint(item.use, context);
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ENDPOINT_CONFIG_INVALID", item.instance));
      continue;
    }
    if (options.capabilities !== undefined && !activation.endpoint.bindings.some((binding) =>
      options.capabilities!.some((capability) => sameCapability(binding.capability, capability)))) {
      continue;
    }
    for (const binding of activation.endpoint.bindings) {
      if (options.capabilities?.some((capability) => sameCapability(binding.capability, capability))) {
        coveredCapabilities.add(capabilityKey(binding.capability));
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
    let packages: readonly RuntimeComponentPackage[] = [];
    try {
      const endpoints = credentialEndpoints.map(({ entry, activation }) => ({
        entry,
        credentials: activation.endpoint.credentials,
      }));
      if (endpoints.every((item) => item.credentials.length === 0)) return { dataRoot: root, diagnostics };
      const serviceEntries = runtimeEntriesForComponents(
        document.components,
        document.bindings.stores.credentials,
      );
      packages = await Promise.all(serviceEntries.map(async (item) => await registry.createComponent(item.use, {
        dataRoot: root,
        instance: item.instance,
        config: item.config ?? {},
      })));
      for (const item of packages) verifyRuntimeComponentPackage(item);
      const byId = new Map(packages.flatMap((item) =>
        item.components.map((component) => [component.instance.id, component] as const)));
      const stores = document.bindings.stores.credentials.map((id) => {
        const component = byId.get(id);
        if (component === undefined) throw new Error(`CredentialStore selection refers to unknown instance ${id}`);
        if (component.role !== "credential-store") {
          throw new Error(`Runtime Component ${id} is ${component.role}, not credential-store`);
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
      await closeRuntimeComponentPackages(packages);
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
  const { document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await Promise.all([
    installLockedRuntimeAdapters(
      registry,
      document.runtimePackageLock,
      profileRoot,
      packageRoot,
      runtimePackageSelection(document),
    ),
  ]);
  const runtimeComponents = await Promise.all(document.components.map(async (item) => {
    return await registry.createComponent(item.use, {
      dataRoot: root,
      instance: item.instance,
      config: item.config ?? {},
    });
  }));
  const endpoints = await Promise.all(document.endpoints.map(async (item) => {
    return await registry.createEndpoint(item.use, {
      dataRoot: root,
      instance: item.instance,
      authority: item.authority ?? item.instance,
      config: item.config ?? {},
    });
  }));
  return await createProjectLocalRuntime({
    dataRoot: root,
    packageRoot,
    runtimeComponents,
    bindings: document.bindings,
    components: [
      ...collectNodePackageComponents((options.implementationPackages?.packages ?? []).map((item) => item.contribution)),
      ...(options.components ?? []),
    ],
    endpoints,
    scheduling: document.limits,
  });
}

async function createSelectedRuntimeComponents(
  document: RuntimeConfigDocument,
  profileRoot: string,
  root: string,
  packageRoot: string,
  registry: RuntimeAdapterRegistry,
  serviceIds: readonly string[],
  readOnly: boolean,
): Promise<readonly RuntimeComponentPackage[]> {
  const serviceEntries = runtimeEntriesForComponents(document.components, serviceIds);
  await installLockedRuntimeAdapters(registry, document.runtimePackageLock, profileRoot, packageRoot, {
    selected: [],
    logical: serviceEntries.map((item) => ({ abi: runtimeComponentAdapterHostAbi, name: item.use })),
  });
  const packages: RuntimeComponentPackage[] = [];
  try {
    for (const item of serviceEntries) {
      packages.push(await registry.createComponent(item.use, {
        dataRoot: root,
        instance: item.instance,
        config: item.config ?? {},
        access: readOnly ? "read-only" : "read-write",
      }));
    }
    return packages;
  } catch (error) {
    await closeRuntimeComponentPackages(packages);
    throw error;
  }
}

/** Open Build, Operation and Dispatch state without constructing an ArtifactStore. */
export async function createRuntimeArchiveFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeArchiveControl> {
  const { createProjectLocalRuntimeArchiveControl } = await import("./control.js");
  const { document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const runtimeComponents = await createSelectedRuntimeComponents(document, profileRoot, root, packageRoot, registry, [
    document.bindings.stores.build,
    document.bindings.stores.operations,
    document.bindings.stores.dispatch,
  ], options.readOnly === true);
  return await createProjectLocalRuntimeArchiveControl({
    dataRoot: root,
    runtimeComponents,
    bindings: document.bindings,
  });
}

/** Open only the ArtifactStore selected by a Runtime Profile. */
export async function createRuntimeArtifactAccessFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeArtifactAccess> {
  const { createProjectLocalRuntimeArtifactAccess } = await import("./control.js");
  const { document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const runtimeComponents = await createSelectedRuntimeComponents(document, profileRoot, root, packageRoot, registry, [
    document.bindings.stores.artifacts,
  ], options.readOnly === true);
  return await createProjectLocalRuntimeArtifactAccess({
    dataRoot: root,
    runtimeComponents,
    bindings: document.bindings,
  });
}

/** Open state plus Artifacts only for explicit cross-store maintenance such as GC. */
export async function createRuntimeMaintenanceFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeControl> {
  const { createProjectLocalRuntimeControl } = await import("./control.js");
  const { document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const runtimeComponents = await createSelectedRuntimeComponents(document, profileRoot, root, packageRoot, registry, [
    document.bindings.stores.build,
    document.bindings.stores.operations,
    document.bindings.stores.dispatch,
    document.bindings.stores.artifacts,
  ], options.readOnly === true);
  return await createProjectLocalRuntimeControl({
    dataRoot: root,
    runtimeComponents,
    bindings: document.bindings,
  });
}

function ownsSelectedComponent(entry: RuntimeConfigEntry, component: string): boolean {
  return component === entry.instance || component.startsWith(`${entry.instance}.`);
}

function runtimeEntriesForComponents(
  entries: readonly RuntimeConfigEntry[],
  components: readonly string[],
): readonly RuntimeConfigEntry[] {
  const selected = new Set<RuntimeConfigEntry>();
  for (const component of components) {
    const owners = entries.filter((entry) => ownsSelectedComponent(entry, component));
    if (owners.length !== 1) {
      throw new Error(owners.length === 0
        ? `Runtime Component ${component} is outside every configured adapter namespace`
        : `Runtime Component ${component} has overlapping configured adapter namespaces`);
    }
    selected.add(owners[0]!);
  }
  return [...selected];
}

async function closeRuntimeComponentPackages(packages: readonly RuntimeComponentPackage[]): Promise<void> {
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
  const { document, profileRoot, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const endpointEntry = document.endpoints.find((item) => item.instance === endpointInstance);
  if (endpointEntry === undefined) throw new Error(`Runtime Profile has no Endpoint instance ${endpointInstance}`);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const serviceEntries = runtimeEntriesForComponents(
    document.components,
    document.bindings.stores.credentials,
  );
  await installLockedRuntimeAdapters(registry, document.runtimePackageLock, profileRoot, packageRoot, {
    selected: [],
    logical: [
      { abi: runtimeEndpointAdapterHostAbi, name: endpointEntry.use },
      ...serviceEntries.map((item) => ({ abi: runtimeComponentAdapterHostAbi, name: item.use })),
    ],
  });
  const packages = await Promise.all(serviceEntries.map(async (item) => await registry.createComponent(item.use, {
    dataRoot: root,
    instance: item.instance,
    config: item.config ?? {},
  })));
  try {
    for (const item of packages) verifyRuntimeComponentPackage(item);
    const byId = new Map(packages.flatMap((item) => item.components.map((component) => [component.instance.id, component] as const)));
    const credentialStores = document.bindings.stores.credentials.map((id) => {
      const component = byId.get(id);
      if (component === undefined) throw new Error(`CredentialStore selection refers to unknown instance ${id}`);
      if (component.role !== "credential-store") {
        throw new Error(`Runtime Component ${id} is ${component.role}, not credential-store`);
      }
      return component.port;
    });
    const endpoint = await registry.createEndpoint(endpointEntry.use, {
      dataRoot: root,
      instance: endpointEntry.instance,
      authority: endpointEntry.authority ?? endpointEntry.instance,
      config: endpointEntry.config ?? {},
    });
    return createLocalCredentialControl({
      credentialStore: new CompositeCredentialStore(credentialStores),
      endpoints: [endpoint],
      close: async () => await closeRuntimeComponentPackages(packages),
    });
  } catch (error) {
    await closeRuntimeComponentPackages(packages);
    throw error;
  }
}
