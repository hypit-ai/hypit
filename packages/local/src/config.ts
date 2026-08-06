import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ComponentPackage } from "@svml/component-kit";
import type { EndpointPackage } from "@svml/endpoint-kit";
import { canonicalize } from "@svml/protocol";
import type { CanonicalValue } from "@svml/protocol";
import type { RuntimeServicePackage } from "@svml/runtime";

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

export type RuntimeConfigFactoryContext = {
  readonly root: string;
  readonly instance: string;
  readonly lane?: string;
  readonly config: CanonicalValue;
};

export type RuntimeEndpointFactory = (
  context: RuntimeConfigFactoryContext,
) => Promise<EndpointPackage> | EndpointPackage;

export type RuntimeServiceFactory = (
  context: RuntimeConfigFactoryContext,
) => Promise<RuntimeServicePackage> | RuntimeServicePackage;

export class RuntimeConfigRegistry {
  readonly #endpoints = new Map<string, RuntimeEndpointFactory>();
  readonly #services = new Map<string, RuntimeServiceFactory>();

  registerEndpoint(use: string, factory: RuntimeEndpointFactory): void {
    if (use.trim().length === 0) throw new Error("Runtime Endpoint adapter name must not be empty");
    if (this.#endpoints.has(use) || this.#services.has(use)) throw new Error(`Runtime adapter ${use} is already registered`);
    this.#endpoints.set(use, factory);
  }

  registerService(use: string, factory: RuntimeServiceFactory): void {
    if (use.trim().length === 0) throw new Error("Runtime service adapter name must not be empty");
    if (this.#endpoints.has(use) || this.#services.has(use)) throw new Error(`Runtime adapter ${use} is already registered`);
    this.#services.set(use, factory);
  }

  endpoint(use: string): RuntimeEndpointFactory | undefined {
    return this.#endpoints.get(use);
  }

  service(use: string): RuntimeServiceFactory | undefined {
    return this.#services.get(use);
  }
}

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
    "format", "root", "statePath", "catalogPath", "artifactPath", "packageLock", "services", "endpoints",
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
    services,
    endpoints,
    ...(selected === undefined ? {} : { selection: selected }),
    permissions: stringList(item.permissions, "$runtime.permissions"),
    ...(scheduled === undefined ? {} : { scheduling: scheduled }),
  };
}

export type LoadRuntimeConfigOptions = {
  readonly registry: RuntimeConfigRegistry;
  readonly components?: readonly ComponentPackage[];
};

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions,
): Promise<LocalRuntime> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const root = resolve(dirname(absolute), document.root ?? ".");
  const services = await Promise.all(document.services.map(async (item) => {
    const factory = options.registry.service(item.use);
    if (factory === undefined) throw new Error(`Runtime service adapter ${item.use} is not registered`);
    return await factory({
      root,
      instance: item.instance,
      config: item.config ?? {},
    });
  }));
  const endpoints = await Promise.all(document.endpoints.map(async (item) => {
    const factory = options.registry.endpoint(item.use);
    if (factory === undefined) throw new Error(`Runtime Endpoint adapter ${item.use} is not registered`);
    return await factory({
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
