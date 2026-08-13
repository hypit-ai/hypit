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
  runtimeServiceAdapterHostAbi,
  RuntimeAdapterRegistry,
} from "@narratage/runtime-adapter";
import type {
  RuntimeDoctorDiagnostic,
  RuntimeEndpointActivation,
  RuntimeExternalService,
  RuntimeServiceState,
} from "@narratage/runtime-adapter";
import {
  CompositeCredentialStore,
  verifyRuntimeServicePackage,
} from "@narratage/runtime";
import type { RuntimeServicePackage, RuntimeServiceSelection } from "@narratage/runtime";

import type { LocalRuntime } from "./types.js";
import type { LocalCredentialControl } from "./types.js";
import type { LocalRuntimeControl } from "./types.js";

export type RuntimeConfigEntry = {
  readonly use: string;
  readonly instance: string;
  readonly authority?: string;
  readonly config?: CanonicalValue;
};

export type RuntimeConfigDocument = {
  readonly format: "svml.runtime-config@1";
  /** Resolved relative to the configuration file. Defaults to its directory. */
  readonly root?: string;
  /** Resolved relative to the configuration file. Locates installed Node packages, not Runtime data. */
  readonly packageRoot?: string;
  readonly packageLock?: string;
  /** Locked physical packages allowed to configure privileged Runtime adapters. */
  readonly runtimePackageLock?: string;
  /** Replaceable parts of the Runtime itself. One package may fill several roles. */
  readonly runtimeServices: readonly RuntimeConfigEntry[];
  readonly services: RuntimeServiceSelection;
  readonly endpoints: readonly RuntimeConfigEntry[];
  readonly scheduling: {
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

function entry(value: unknown, subject: string, authorityRequired: boolean): RuntimeConfigEntry {
  const item = object(value, subject);
  exactKeys(item, authorityRequired ? ["use", "instance", "authority", "config"] : ["use", "instance", "config"], subject);
  const authority = authorityRequired ? optionalString(item.authority, `${subject}.authority`) : undefined;
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance: requiredString(item.instance, `${subject}.instance`),
    ...(authority === undefined ? {} : { authority }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}


function scheduling(value: unknown): RuntimeConfigDocument["scheduling"] {
  if (value === undefined) throw new Error("$runtime.scheduling is required");
  const item = object(value, "$runtime.scheduling");
  exactKeys(item, ["maxConcurrency", "resources"], "$runtime.scheduling");
  const resources = item.resources === undefined ? undefined : object(item.resources, "$runtime.scheduling.resources");
  const normalizedResources = resources === undefined ? undefined : Object.fromEntries(Object.entries(resources).map(([name, limit]) => {
    if (name.trim().length === 0) throw new Error("Runtime resource id must not be empty");
    return [name, positiveInteger(limit, `$runtime.scheduling.resources.${name}`)!];
  }));
  const maxConcurrency = positiveInteger(item.maxConcurrency, "$runtime.scheduling.maxConcurrency");
  if (maxConcurrency === undefined) throw new Error("$runtime.scheduling.maxConcurrency is required");
  return {
    maxConcurrency,
    ...(normalizedResources === undefined ? {} : { resources: normalizedResources }),
  };
}

function serviceSelection(value: unknown): RuntimeServiceSelection {
  const item = object(value, "$runtime.services");
  exactKeys(item, ["scheduler", "worker", "stores"], "$runtime.services");
  const stores = object(item.stores, "$runtime.services.stores");
  exactKeys(stores, ["build", "operations", "dispatch", "artifacts", "credentials"],
    "$runtime.services.stores");
  const credentials = stringList(stores.credentials, "$runtime.services.stores.credentials");
  return {
    scheduler: requiredString(item.scheduler, "$runtime.services.scheduler"),
    worker: requiredString(item.worker, "$runtime.services.worker"),
    stores: {
      build: requiredString(stores.build, "$runtime.services.stores.build"),
      operations: requiredString(stores.operations, "$runtime.services.stores.operations"),
      dispatch: requiredString(stores.dispatch, "$runtime.services.stores.dispatch"),
      artifacts: requiredString(stores.artifacts, "$runtime.services.stores.artifacts"),
      credentials,
    },
  };
}

export function parseRuntimeConfig(value: unknown): RuntimeConfigDocument {
  const item = object(value, "$runtime");
  exactKeys(item, [
    "format", "root", "packageRoot", "packageLock", "runtimePackageLock",
    "runtimeServices", "services", "endpoints", "scheduling",
  ], "$runtime");
  if (item.format !== "svml.runtime-config@1") throw new Error("$runtime.format must be svml.runtime-config@1");
  if (!Array.isArray(item.runtimeServices)) throw new Error("$runtime.runtimeServices must be an array");
  const runtimeServices = item.runtimeServices.map((value, index) =>
    entry(value, `$runtime.runtimeServices[${index}]`, false));
  const endpoints = item.endpoints === undefined ? [] : (() => {
    if (!Array.isArray(item.endpoints)) throw new Error("$runtime.endpoints must be an array");
    return item.endpoints.map((value, index) => entry(value, `$runtime.endpoints[${index}]`, true));
  })();
  const instances = [...runtimeServices, ...endpoints].map((value) => value.instance);
  if (new Set(instances).size !== instances.length) throw new Error("$runtime repeats a Runtime instance id");
  const scheduled = scheduling(item.scheduling);
  return {
    format: "svml.runtime-config@1",
    ...(optionalString(item.root, "$runtime.root") === undefined ? {} : { root: item.root as string }),
    ...(optionalString(item.packageRoot, "$runtime.packageRoot") === undefined
      ? {}
      : { packageRoot: item.packageRoot as string }),
    ...(optionalString(item.packageLock, "$runtime.packageLock") === undefined ? {} : { packageLock: item.packageLock as string }),
    ...(optionalString(item.runtimePackageLock, "$runtime.runtimePackageLock") === undefined
      ? {}
      : { runtimePackageLock: item.runtimePackageLock as string }),
    runtimeServices,
    services: serviceSelection(item.services),
    endpoints,
    scheduling: scheduled,
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
  readonly root: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

export type RuntimeConfigPackageSelection = {
  readonly root: string;
  readonly packageRoot: string;
  readonly packageLock?: string;
  readonly runtimePackageLock?: string;
  /** Logical Runtime adapters selected by kind and use name. */
  readonly runtimeSelection: NodePackageSelectionRequest;
};

function runtimePackageSelection(document: RuntimeConfigDocument): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [
      ...document.runtimeServices.map((item) => ({ abi: runtimeServiceAdapterHostAbi, name: item.use })),
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
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const packageRoot = resolve(dirname(absolute), document.packageRoot ?? options.packageRoot ?? document.root ?? ".");
  return {
    root,
    packageRoot,
    runtimeSelection: runtimePackageSelection(document),
    ...(document.packageLock === undefined
      ? {}
      : { packageLock: resolve(root, document.packageLock) }),
    ...(document.runtimePackageLock === undefined
      ? {}
      : { runtimePackageLock: resolve(root, document.runtimePackageLock) }),
  };
}

/** Deployment revision understood only by this Runtime Profile implementation. */
export async function runtimeConfigRevision(path: string): Promise<string> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const locks: Record<string, string> = {};
  for (const [name, value] of [
    ["packageLock", document.packageLock],
    ["runtimePackageLock", document.runtimePackageLock],
  ] as const) {
    if (value === undefined) continue;
    locks[name] = (await readNodePackageLock(resolve(root, value))).digest;
  }
  return digestOf(canonicalize({
    format: "svml.runtime-config-revision@1",
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
export type DeclaredExternalService = {
  readonly instance: string;
  readonly service: RuntimeExternalService;
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
 * by `service.id` and act once.
 */
export async function declaredExternalServices(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<{ readonly root: string; readonly services: readonly DeclaredExternalService[] }> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  // A Build with no demanded external capability has no program to discover.
  // Keep validating the Profile document and its root, but do not load the
  // privileged Runtime package closure merely to prove that the empty set is
  // empty. `services up/status/down` omit this filter and still inspect every
  // declared service.
  if (options.capabilities?.length === 0) return { root, services: [] };
  const packageRoot = resolve(dirname(absolute), document.packageRoot ?? options.packageRoot ?? document.root ?? ".");
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installLockedRuntimeAdapters(registry, document.runtimePackageLock, root, packageRoot, runtimePackageSelection(document));
  const services: DeclaredExternalService[] = [];
  for (const item of document.endpoints) {
    if (!registry.has(item.use, "endpoint")) {
      throw new Error(`Runtime Adapter ${item.use} is not registered`);
    }
    const activation = await registry.activateEndpoint(item.use, {
      root,
      instance: item.instance,
      authority: item.authority ?? item.instance,
      config: item.config ?? {},
    });
    if (options.capabilities !== undefined && !activation.endpoint.bindings.some((binding) =>
      options.capabilities!.some((capability) => sameCapability(binding.capability, capability)))) {
      continue;
    }
    const service = activation.externalService;
    if (service !== undefined) services.push({ instance: item.instance, service });
  }
  return { root, services };
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
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const packageRoot = resolve(dirname(absolute), document.packageRoot ?? options.packageRoot ?? document.root ?? ".");
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
    diagnostics.push(diagnostic(error, "RUNTIME_ROOT_INVALID", root));
    return { root, diagnostics };
  }
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const runtimeLock = installLockedRuntimeAdapters(
    registry,
    document.runtimePackageLock,
    root,
    packageRoot,
    runtimePackageSelection(document),
  );
  const implementationLock = options.implementationPackages !== undefined
    ? (async () => {
        if (document.packageLock === undefined) throw new Error("Runtime Profile has no packageLock for verified implementation packages");
        const declared = await readNodePackageLock(resolve(root, document.packageLock));
        if (declared.digest !== options.implementationPackages!.inventoryDigest) {
          throw new Error("Runtime Profile packageLock differs from the implementation packages already verified by this Host");
        }
        return options.implementationPackages;
      })()
    : document.packageLock === undefined
    ? Promise.resolve(undefined)
    : loadNodePackageSet(resolve(root, document.packageLock), packageRoot);
  const [runtimeResult, implementationResult] = await Promise.allSettled([runtimeLock, implementationLock]);
  if (runtimeResult.status === "rejected") {
    diagnostics.push(diagnostic(runtimeResult.reason, "RUNTIME_PACKAGE_LOCK_INVALID", document.runtimePackageLock));
    return { root, diagnostics };
  }
  if (implementationResult.status === "rejected") {
    diagnostics.push(diagnostic(implementationResult.reason, "IMPLEMENTATION_PACKAGE_LOCK_INVALID", document.packageLock));
  }
  for (const item of document.runtimeServices) {
    const context = { root, instance: item.instance, config: item.config ?? {} };
    try {
      const selection = registry.validate(item.use, "runtime-service", context);
      diagnostics.push(...selection);
      if (selection.some((entry) => entry.severity === "error")) continue;
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_SERVICE_CONFIG_INVALID", item.instance));
      continue;
    }
    try {
      diagnostics.push(...await registry.doctor(item.use, "runtime-service", context));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
    }
  }
  for (const item of document.endpoints) {
    const context = {
      root,
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
    // An external program is a prerequisite a Build cannot supply for itself, so
    // name the command that supplies it here rather than failing mid-Build on a
    // socket. `RUNTIME_SERVICE_` above is the Runtime's own part; this is the
    // separate program a deployment must have installed or running.
    let service: RuntimeExternalService | undefined;
    try {
      service = activation.externalService;
    } catch (error) {
      diagnostics.push(diagnostic(error, "EXTERNAL_SERVICE_INVALID", item.instance));
    }
    if (service === undefined) continue;
    let state: RuntimeServiceState;
    try {
      state = await service.probe();
    } catch (error) {
      diagnostics.push(diagnostic(error, "EXTERNAL_SERVICE_PROBE_FAILED", service.id));
      continue;
    }
    if (state.state === "down") {
      diagnostics.push({
        severity: "error",
        code: "EXTERNAL_SERVICE_DOWN",
        message: `${service.id} is not usable: ${state.detail}.${
          service.start === undefined && service.prepare === undefined
            ? ""
            : " Bring it up with: narratage services up"}`,
        subject: service.id,
      });
    } else if (state.state === "mismatch") {
      diagnostics.push({
        severity: "error",
        code: "EXTERNAL_SERVICE_MISMATCH",
        message: `${service.id} is running but differs from this Runtime Profile: ${state.detail}`,
        subject: service.id,
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
    let packages: readonly RuntimeServicePackage[] = [];
    try {
      const endpoints = credentialEndpoints.map(({ entry, activation }) => ({
        entry,
        credentials: activation.endpoint.credentials,
      }));
      if (endpoints.every((item) => item.credentials.length === 0)) return { root, diagnostics };
      const serviceEntries = runtimeEntriesForServices(
        document.runtimeServices,
        document.services.stores.credentials,
      );
      packages = await Promise.all(serviceEntries.map(async (item) => await registry.createService(item.use, {
        root,
        instance: item.instance,
        config: item.config ?? {},
      })));
      for (const item of packages) verifyRuntimeServicePackage(item);
      const byId = new Map(packages.flatMap((item) =>
        item.services.map((service) => [service.instance.id, service] as const)));
      const stores = document.services.stores.credentials.map((id) => {
        const service = byId.get(id);
        if (service === undefined) throw new Error(`CredentialStore selection refers to unknown instance ${id}`);
        if (service.role !== "credential-store") {
          throw new Error(`Runtime service ${id} is ${service.role}, not credential-store`);
        }
        return service.service;
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
      await closeRuntimeServicePackages(packages);
    }
  }
  return { root, diagnostics };
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  // Diagnostics and lifecycle discovery must not initialize SQLite, Drivers or Endpoints.
  // Load the executable Runtime assembly only on the command that actually constructs it.
  const { createProjectLocalRuntime } = await import("./runtime.js");
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const packageRoot = resolve(dirname(absolute), document.packageRoot ?? options.packageRoot ?? document.root ?? ".");
  if (options.implementationPackages !== undefined) {
    if (document.packageLock === undefined) {
      throw new Error("Runtime Profile has no packageLock for the supplied implementation packages");
    }
    const declared = await readNodePackageLock(resolve(root, document.packageLock));
    if (declared.digest !== options.implementationPackages.inventoryDigest) {
      throw new Error("Runtime Profile packageLock differs from the implementation packages already verified by this Host");
    }
  }
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  const implementationPackagesPromise = options.implementationPackages !== undefined
    ? Promise.resolve(options.implementationPackages)
    : document.packageLock === undefined
      ? Promise.resolve(undefined)
      : loadNodePackageSet(resolve(root, document.packageLock), packageRoot);
  const [, implementationPackages] = await Promise.all([
    installLockedRuntimeAdapters(
      registry,
      document.runtimePackageLock,
      root,
      packageRoot,
      runtimePackageSelection(document),
    ),
    implementationPackagesPromise,
  ]);
  const runtimeServices = await Promise.all(document.runtimeServices.map(async (item) => {
    return await registry.createService(item.use, {
      root,
      instance: item.instance,
      config: item.config ?? {},
    });
  }));
  const endpoints = await Promise.all(document.endpoints.map(async (item) => {
    return await registry.createEndpoint(item.use, {
      root,
      instance: item.instance,
      authority: item.authority ?? item.instance,
      config: item.config ?? {},
    });
  }));
  return await createProjectLocalRuntime({
    root,
    packageRoot,
    runtimeServices,
    runtimeSelection: document.services,
    components: [
      ...collectNodePackageComponents((implementationPackages?.packages ?? []).map((item) => item.contribution)),
      ...(options.components ?? []),
    ],
    endpoints,
    scheduling: document.scheduling,
  });
}

/**
 * Open only the durable control Stores selected by a Runtime Profile. Endpoint
 * construction, credential resolution, author components and Worker instances
 * are unnecessary for archive inspection, queue visibility, egress and cancellation.
 */
export async function createRuntimeControlFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeControl> {
  const { createProjectLocalRuntimeControl } = await import("./control.js");
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const packageRoot = resolve(dirname(absolute), document.packageRoot ?? options.packageRoot ?? document.root ?? ".");
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installLockedRuntimeAdapters(registry, document.runtimePackageLock, root, packageRoot, runtimePackageSelection(document));
  const runtimeServices = await Promise.all(document.runtimeServices.map(async (item) => {
    return await registry.createService(item.use, {
      root,
      instance: item.instance,
      config: item.config ?? {},
      access: options.readOnly ? "read-only" : "read-write",
    });
  }));
  return await createProjectLocalRuntimeControl({
    root,
    runtimeServices,
    runtimeSelection: document.services,
  });
}

function ownsSelectedService(entry: RuntimeConfigEntry, service: string): boolean {
  return service === entry.instance || service.startsWith(`${entry.instance}.`);
}

function runtimeEntriesForServices(
  entries: readonly RuntimeConfigEntry[],
  services: readonly string[],
): readonly RuntimeConfigEntry[] {
  const selected = new Set<RuntimeConfigEntry>();
  for (const service of services) {
    const owners = entries.filter((entry) => ownsSelectedService(entry, service));
    if (owners.length !== 1) {
      throw new Error(owners.length === 0
        ? `Runtime service ${service} is outside every configured adapter namespace`
        : `Runtime service ${service} has overlapping configured adapter namespaces`);
    }
    selected.add(owners[0]!);
  }
  return [...selected];
}

async function closeRuntimeServicePackages(packages: readonly RuntimeServicePackage[]): Promise<void> {
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
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const packageRoot = resolve(dirname(absolute), document.packageRoot ?? options.packageRoot ?? document.root ?? ".");
  const endpointEntry = document.endpoints.find((item) => item.instance === endpointInstance);
  if (endpointEntry === undefined) throw new Error(`Runtime Profile has no Endpoint instance ${endpointInstance}`);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installLockedRuntimeAdapters(registry, document.runtimePackageLock, root, packageRoot, runtimePackageSelection(document));
  const serviceEntries = runtimeEntriesForServices(
    document.runtimeServices,
    document.services.stores.credentials,
  );
  const packages = await Promise.all(serviceEntries.map(async (item) => await registry.createService(item.use, {
    root,
    instance: item.instance,
    config: item.config ?? {},
  })));
  try {
    for (const item of packages) verifyRuntimeServicePackage(item);
    const byId = new Map(packages.flatMap((item) => item.services.map((service) => [service.instance.id, service] as const)));
    const credentialStores = document.services.stores.credentials.map((id) => {
      const service = byId.get(id);
      if (service === undefined) throw new Error(`CredentialStore selection refers to unknown instance ${id}`);
      if (service.role !== "credential-store") {
        throw new Error(`Runtime service ${id} is ${service.role}, not credential-store`);
      }
      return service.service;
    });
    const endpoint = await registry.createEndpoint(endpointEntry.use, {
      root,
      instance: endpointEntry.instance,
      authority: endpointEntry.authority ?? endpointEntry.instance,
      config: endpointEntry.config ?? {},
    });
    return createLocalCredentialControl({
      credentialStore: new CompositeCredentialStore(credentialStores),
      endpoints: [endpoint],
      close: async () => await closeRuntimeServicePackages(packages),
    });
  } catch (error) {
    await closeRuntimeServicePackages(packages);
    throw error;
  }
}
