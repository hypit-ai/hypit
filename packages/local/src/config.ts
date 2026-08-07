import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ComponentPackage } from "@narratage/component-kit";
import { loadNodePackageSet } from "@narratage/package-loader-node";
import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import {
  isRuntimeAdapterHostFacet,
  RuntimeAdapterRegistry,
} from "@narratage/runtime-adapter";
import type { RuntimeDoctorDiagnostic } from "@narratage/runtime-adapter";

import { createProjectLocalRuntime } from "./runtime.js";
import type { LocalRuntime } from "./types.js";

export type RuntimeConfigEntry = {
  readonly use: string;
  readonly instance: string;
  readonly lane?: string;
  readonly config?: CanonicalValue;
};

export type RuntimeConfigDocument = {
  readonly format: "svml.runtime-config@1";
  /** Resolved relative to the configuration file. Defaults to its directory. */
  readonly root?: string;
  readonly statePath?: string;
  readonly catalogPath?: string;
  readonly artifactPath?: string;
  readonly packageLock?: string;
  /** Locked physical packages allowed to configure privileged Runtime adapters. */
  readonly runtimePackageLock?: string;
  readonly services: readonly RuntimeConfigEntry[];
  readonly endpoints: readonly RuntimeConfigEntry[];
  readonly selection?: {
    readonly scheduler?: string;
    readonly stores?: {
      readonly build?: string;
      readonly operations?: string;
      readonly artifacts?: string;
      readonly credentials?: string;
    };
  };
  readonly permissions: readonly string[];
  readonly scheduling?: {
    readonly maxConcurrency?: number;
    readonly lanes?: Readonly<Record<string, number>>;
    readonly maxEventsPerBuild?: number;
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

function entry(value: unknown, subject: string, laneAllowed: boolean): RuntimeConfigEntry {
  const item = object(value, subject);
  exactKeys(item, laneAllowed ? ["use", "instance", "lane", "config"] : ["use", "instance", "config"], subject);
  const lane = laneAllowed ? optionalString(item.lane, `${subject}.lane`) : undefined;
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance: requiredString(item.instance, `${subject}.instance`),
    ...(lane === undefined ? {} : { lane }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}

function selection(value: unknown): RuntimeConfigDocument["selection"] {
  if (value === undefined) return undefined;
  const item = object(value, "$runtime.selection");
  exactKeys(item, ["scheduler", "stores"], "$runtime.selection");
  const stores = item.stores === undefined ? undefined : object(item.stores, "$runtime.selection.stores");
  if (stores !== undefined) exactKeys(stores, ["build", "operations", "artifacts", "credentials"], "$runtime.selection.stores");
  const scheduler = optionalString(item.scheduler, "$runtime.selection.scheduler");
  return {
    ...(scheduler === undefined ? {} : { scheduler }),
    ...(stores === undefined ? {} : { stores: {
      ...(optionalString(stores.build, "$runtime.selection.stores.build") === undefined ? {} : { build: stores.build as string }),
      ...(optionalString(stores.operations, "$runtime.selection.stores.operations") === undefined ? {} : { operations: stores.operations as string }),
      ...(optionalString(stores.artifacts, "$runtime.selection.stores.artifacts") === undefined ? {} : { artifacts: stores.artifacts as string }),
      ...(optionalString(stores.credentials, "$runtime.selection.stores.credentials") === undefined ? {} : { credentials: stores.credentials as string }),
    } }),
  };
}

function scheduling(value: unknown): RuntimeConfigDocument["scheduling"] {
  if (value === undefined) return undefined;
  const item = object(value, "$runtime.scheduling");
  exactKeys(item, ["maxConcurrency", "lanes", "maxEventsPerBuild"], "$runtime.scheduling");
  const lanes = item.lanes === undefined ? undefined : object(item.lanes, "$runtime.scheduling.lanes");
  const normalizedLanes = lanes === undefined ? undefined : Object.fromEntries(Object.entries(lanes).map(([name, limit]) => {
    if (name.trim().length === 0) throw new Error("Runtime lane name must not be empty");
    return [name, positiveInteger(limit, `$runtime.scheduling.lanes.${name}`)!];
  }));
  return {
    ...(positiveInteger(item.maxConcurrency, "$runtime.scheduling.maxConcurrency") === undefined
      ? {}
      : { maxConcurrency: item.maxConcurrency as number }),
    ...(normalizedLanes === undefined ? {} : { lanes: normalizedLanes }),
    ...(positiveInteger(item.maxEventsPerBuild, "$runtime.scheduling.maxEventsPerBuild") === undefined
      ? {}
      : { maxEventsPerBuild: item.maxEventsPerBuild as number }),
  };
}

export function parseRuntimeConfig(value: unknown): RuntimeConfigDocument {
  const item = object(value, "$runtime");
  exactKeys(item, [
    "format", "root", "statePath", "catalogPath", "artifactPath", "packageLock", "runtimePackageLock",
    "services", "endpoints",
    "selection", "permissions", "scheduling",
  ], "$runtime");
  if (item.format !== "svml.runtime-config@1") throw new Error("$runtime.format must be svml.runtime-config@1");
  const services = item.services === undefined ? [] : (() => {
    if (!Array.isArray(item.services)) throw new Error("$runtime.services must be an array");
    return item.services.map((value, index) => entry(value, `$runtime.services[${index}]`, false));
  })();
  const endpoints = item.endpoints === undefined ? [] : (() => {
    if (!Array.isArray(item.endpoints)) throw new Error("$runtime.endpoints must be an array");
    return item.endpoints.map((value, index) => entry(value, `$runtime.endpoints[${index}]`, true));
  })();
  const instances = [...services, ...endpoints].map((value) => value.instance);
  if (new Set(instances).size !== instances.length) throw new Error("$runtime repeats a Runtime instance id");
  const selected = selection(item.selection);
  const scheduled = scheduling(item.scheduling);
  return {
    format: "svml.runtime-config@1",
    ...(optionalString(item.root, "$runtime.root") === undefined ? {} : { root: item.root as string }),
    ...(optionalString(item.statePath, "$runtime.statePath") === undefined ? {} : { statePath: item.statePath as string }),
    ...(optionalString(item.catalogPath, "$runtime.catalogPath") === undefined ? {} : { catalogPath: item.catalogPath as string }),
    ...(optionalString(item.artifactPath, "$runtime.artifactPath") === undefined ? {} : { artifactPath: item.artifactPath as string }),
    ...(optionalString(item.packageLock, "$runtime.packageLock") === undefined ? {} : { packageLock: item.packageLock as string }),
    ...(optionalString(item.runtimePackageLock, "$runtime.runtimePackageLock") === undefined
      ? {}
      : { runtimePackageLock: item.runtimePackageLock as string }),
    services,
    endpoints,
    ...(selected === undefined ? {} : { selection: selected }),
    permissions: stringList(item.permissions, "$runtime.permissions"),
    ...(scheduled === undefined ? {} : { scheduling: scheduled }),
  };
}

export type LoadRuntimeConfigOptions = {
  /** Trusted embedding adapters. Locked installed adapters are normally selected by runtimePackageLock. */
  readonly registry?: RuntimeAdapterRegistry;
  readonly components?: readonly ComponentPackage[];
};

export type RuntimeConfigDoctorResult = {
  readonly root: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

async function installLockedRuntimeAdapters(
  registry: RuntimeAdapterRegistry,
  path: string | undefined,
  root: string,
): Promise<void> {
  if (path === undefined) return;
  const loaded = await loadNodePackageSet(resolve(root, path), root);
  const lockedPackages = new Map(loaded.lock.packages.map((item) => [item.package.name, item]));
  const artifacts = new Map(loaded.lock.artifacts.map((item) => [`${item.name}@${item.version}`, item]));
  for (const contribution of loaded.contributions) {
    const locked = lockedPackages.get(contribution.name);
    if (locked === undefined) throw new Error(`Runtime package ${contribution.name} is absent from its verified lock`);
    const artifact = artifacts.get(`${locked.package.name}@${locked.package.version}`);
    if (artifact === undefined) throw new Error(`Runtime package ${contribution.name} has no verified physical Artifact`);
    for (const facet of contribution.hostFacets ?? []) {
      if (!isRuntimeAdapterHostFacet(facet)) continue;
      registry.registerFacet(facet, {
        packageName: contribution.name,
        packageArtifactDigest: artifact.digest,
        packageClosureDigest: locked.closureDigest,
      });
    }
  }
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
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfigDoctorResult> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const diagnostics: RuntimeDoctorDiagnostic[] = [];
  try {
    if (!(await stat(root)).isDirectory()) throw new Error(`Runtime root ${root} is not a directory`);
  } catch (error) {
    diagnostics.push(diagnostic(error, "RUNTIME_ROOT_INVALID", root));
    return { root, diagnostics };
  }
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  try {
    await installLockedRuntimeAdapters(registry, document.runtimePackageLock, root);
  } catch (error) {
    diagnostics.push(diagnostic(error, "RUNTIME_PACKAGE_LOCK_INVALID", document.runtimePackageLock));
    return { root, diagnostics };
  }
  if (document.packageLock !== undefined) {
    try {
      await loadNodePackageSet(resolve(root, document.packageLock), root);
    } catch (error) {
      diagnostics.push(diagnostic(error, "IMPLEMENTATION_PACKAGE_LOCK_INVALID", document.packageLock));
    }
  }
  for (const item of document.services) {
    const context = { root, instance: item.instance, config: item.config ?? {} };
    try {
      diagnostics.push(...await registry.doctor(item.use, "service", context));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
    }
    if (!registry.has(item.use, "service")) continue;
    try {
      await registry.createService(item.use, context);
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_SERVICE_CONFIG_INVALID", item.instance));
    }
  }
  for (const item of document.endpoints) {
    const context = {
      root,
      instance: item.instance,
      ...(item.lane === undefined ? {} : { lane: item.lane }),
      config: item.config ?? {},
    };
    try {
      diagnostics.push(...await registry.doctor(item.use, "endpoint", context));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
    }
    if (!registry.has(item.use, "endpoint")) continue;
    try {
      await registry.createEndpoint(item.use, context);
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ENDPOINT_CONFIG_INVALID", item.instance));
    }
  }
  return { root, diagnostics };
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installLockedRuntimeAdapters(registry, document.runtimePackageLock, root);
  const services = await Promise.all(document.services.map(async (item) => {
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
      ...(item.lane === undefined ? {} : { lane: item.lane }),
      config: item.config ?? {},
    });
  }));
  return await createProjectLocalRuntime({
    root,
    ...(document.statePath === undefined ? {} : { statePath: document.statePath }),
    ...(document.catalogPath === undefined ? {} : { catalogPath: document.catalogPath }),
    ...(document.artifactPath === undefined ? {} : { artifactPath: document.artifactPath }),
    ...(document.packageLock === undefined ? {} : { packageLock: document.packageLock }),
    runtimeServices: services,
    ...(document.selection === undefined ? {} : { runtimeSelection: document.selection }),
    components: options.components ?? [],
    endpoints,
    allowedPermissions: document.permissions,
    ...(document.scheduling === undefined ? {} : { scheduling: document.scheduling }),
  });
}
