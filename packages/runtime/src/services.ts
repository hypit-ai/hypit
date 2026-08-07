import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CanonicalValue, Digest, ModuleRef } from "@narratage/protocol";

import type { CredentialStore } from "./credentials.js";
import type { OperationStore } from "./operations.js";
import {
  RuntimeModuleRegistry,
} from "./profile.js";
import type {
  RuntimeModuleManifest,
  RuntimeProfileInstance,
  RuntimeServiceFacetRole,
} from "./profile.js";
import type {
  ArtifactStore,
  BuildSchedulerFactory,
  BuildStore,
} from "./types.js";

type RuntimeServiceBase<Role extends RuntimeServiceFacetRole, Service> = {
  readonly role: Role;
  readonly instance: RuntimeProfileInstance;
  readonly service: Service;
};

export type RuntimeSchedulerService = RuntimeServiceBase<"scheduler", BuildSchedulerFactory>;
export type RuntimeBuildStoreService = RuntimeServiceBase<"build-store", BuildStore>;
export type RuntimeOperationStoreService = RuntimeServiceBase<"operation-store", OperationStore>;
export type RuntimeArtifactStoreService = RuntimeServiceBase<"artifact-store", ArtifactStore>;
export type RuntimeCredentialStoreService = RuntimeServiceBase<"credential-store", CredentialStore>;

export type RuntimeService =
  | RuntimeSchedulerService
  | RuntimeBuildStoreService
  | RuntimeOperationStoreService
  | RuntimeArtifactStoreService
  | RuntimeCredentialStoreService;

/** One configured deployment package may expose several exact Runtime services. */
export type RuntimeServicePackage = {
  readonly name: string;
  readonly manifest: RuntimeModuleManifest;
  readonly services: readonly RuntimeService[];
  close?(): void | Promise<void>;
};

type RuntimeServiceDefinitionBase<Role extends RuntimeServiceFacetRole, Service> = {
  readonly role: Role;
  readonly facet: string;
  readonly instance: string;
  readonly implementation: {
    readonly locator: string;
    readonly digest: Digest;
  };
  readonly permissions?: readonly string[];
  readonly configuration?: CanonicalValue;
  readonly service: Service;
};

export type RuntimeServiceDefinition =
  | RuntimeServiceDefinitionBase<"scheduler", BuildSchedulerFactory>
  | RuntimeServiceDefinitionBase<"build-store", BuildStore>
  | RuntimeServiceDefinitionBase<"operation-store", OperationStore>
  | RuntimeServiceDefinitionBase<"artifact-store", ArtifactStore>
  | RuntimeServiceDefinitionBase<"credential-store", CredentialStore>;

export type DefineRuntimeServicePackageOptions = {
  readonly name?: string;
  readonly module: ModuleRef;
  readonly services: readonly RuntimeServiceDefinition[];
  readonly close?: () => void | Promise<void>;
};

export type RuntimeServiceSelection = {
  readonly scheduler: string;
  readonly stores: {
    readonly build?: string;
    readonly operations?: string;
    readonly artifacts?: string;
    readonly credentials?: string;
  };
};

export type RuntimeServiceAssembly = {
  readonly manifests: readonly RuntimeModuleManifest[];
  readonly instances: readonly RuntimeProfileInstance[];
  readonly scheduler: BuildSchedulerFactory;
  readonly buildStore?: BuildStore;
  readonly operationStore?: OperationStore;
  readonly artifactStore?: ArtifactStore;
  readonly credentialStore?: CredentialStore;
  close(): Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function serviceFacetKey(service: RuntimeService): string {
  const ref = service.instance.facet;
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

function normalizePermissions(values: readonly string[]): readonly string[] {
  const permissions = [...values].map((value) => {
    assert(value.trim().length > 0, "Runtime service permission is empty");
    return value;
  }).sort();
  assert(new Set(permissions).size === permissions.length, "Runtime service repeats a permission");
  return permissions;
}

function callable(value: object, name: string, subject: string): void {
  assert(name in value && typeof (value as Record<string, unknown>)[name] === "function",
    `${subject} does not implement ${name}()`);
}

function verifyServicePort(service: RuntimeService): void {
  assert(typeof service.service === "object" && service.service !== null,
    `${service.instance.id} Runtime service implementation is invalid`);
  switch (service.role) {
    case "scheduler":
      callable(service.service, "create", service.instance.id);
      break;
    case "build-store":
      callable(service.service, "create", service.instance.id);
      callable(service.service, "read", service.instance.id);
      callable(service.service, "compareAndSwap", service.instance.id);
      break;
    case "operation-store":
      callable(service.service, "create", service.instance.id);
      callable(service.service, "read", service.instance.id);
      callable(service.service, "list", service.instance.id);
      callable(service.service, "compareAndSwap", service.instance.id);
      break;
    case "artifact-store":
      callable(service.service, "put", service.instance.id);
      callable(service.service, "get", service.instance.id);
      callable(service.service, "has", service.instance.id);
      break;
    case "credential-store":
      callable(service.service, "resolve", service.instance.id);
      break;
  }
}

export function defineRuntimeServicePackage(
  options: DefineRuntimeServicePackageOptions,
): RuntimeServicePackage {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Runtime service module identity is invalid");
  assert(options.services.length > 0, "Runtime service package is empty");
  const instances = new Set<string>();
  const facets = new Set<string>();
  const services = options.services.map((definition): RuntimeService => {
    assert(definition.facet.trim().length > 0, "Runtime service facet is empty");
    assert(definition.instance.trim().length > 0, "Runtime service instance is empty");
    assert(!instances.has(definition.instance), `Runtime service instance ${definition.instance} is duplicated`);
    assert(!facets.has(definition.facet), `Runtime service facet ${definition.facet} is duplicated`);
    assert(definition.implementation.locator.trim().length > 0, `${definition.instance} implementation locator is empty`);
    assert(isDigest(definition.implementation.digest), `${definition.instance} implementation digest is invalid`);
    instances.add(definition.instance);
    facets.add(definition.facet);
    return {
      role: definition.role,
      instance: {
        id: definition.instance,
        facet: { module: { ...options.module }, name: definition.facet },
        configurationDigest: digestOf(canonicalize(definition.configuration ?? null)),
      },
      service: definition.service,
    } as RuntimeService;
  });
  const manifest: RuntimeModuleManifest = {
    format: "svml.runtime-module@1",
    name: options.module.name,
    version: options.module.version,
    facets: options.services.map((definition) => ({
      name: definition.facet,
      role: definition.role,
      implementation: { ...definition.implementation },
      permissions: normalizePermissions(definition.permissions ?? []),
    })),
  };
  const result: RuntimeServicePackage = {
    name: options.name ?? options.module.name,
    manifest,
    services,
    ...(options.close === undefined ? {} : { close: options.close }),
  };
  verifyRuntimeServicePackage(result);
  return result;
}

export function verifyRuntimeServicePackage(value: RuntimeServicePackage): void {
  assert(value.name.trim().length > 0, "Runtime service package name is empty");
  assert(value.services.length > 0, `${value.name} contains no Runtime service`);
  const modules = new RuntimeModuleRegistry();
  modules.register(value.manifest);
  const ids = new Set<string>();
  const claimedFacets = new Set<string>();
  for (const service of value.services) {
    assert(service.instance.id.trim().length > 0, `${value.name} Runtime service instance is empty`);
    assert(!ids.has(service.instance.id), `${value.name} repeats Runtime service ${service.instance.id}`);
    ids.add(service.instance.id);
    if (service.instance.configurationDigest !== undefined) {
      assert(isDigest(service.instance.configurationDigest),
        `${value.name} service ${service.instance.id} configuration digest is invalid`);
    }
    verifyServicePort(service);
    const resolved = modules.resolve(service.instance.facet);
    assert(resolved !== undefined, `${value.name} service ${service.instance.id} has no Manifest facet`);
    assert(resolved.facet.role === service.role,
      `${value.name} service ${service.instance.id} role differs from its Manifest facet`);
    claimedFacets.add(serviceFacetKey(service));
  }
  for (const facet of value.manifest.facets) {
    assert(facet.role !== "capability-endpoint", `${value.name} Runtime service Manifest contains an Endpoint facet`);
    const key = `${value.manifest.name}@${value.manifest.version}#${facet.name}`;
    assert(claimedFacets.has(key), `${value.name} Manifest facet ${facet.name} has no configured service`);
  }
}

type SelectedRuntimeService<Role extends RuntimeServiceFacetRole> = {
  readonly package: RuntimeServicePackage;
  readonly service: Extract<RuntimeService, { readonly role: Role }>;
};

function selectedService<Role extends RuntimeServiceFacetRole>(
  services: ReadonlyMap<string, { readonly package: RuntimeServicePackage; readonly service: RuntimeService }>,
  id: string | undefined,
  role: Role,
): SelectedRuntimeService<Role> | undefined {
  if (id === undefined) return undefined;
  const selected = services.get(id);
  assert(selected !== undefined, `Runtime service selection refers to unknown instance ${id}`);
  assert(selected.service.role === role, `Runtime service ${id} is ${selected.service.role}, not ${role}`);
  return selected as SelectedRuntimeService<Role>;
}

/** Resolve exact configured service instances without giving any package routing authority. */
export function assembleRuntimeServices(
  packages: readonly RuntimeServicePackage[],
  selection: RuntimeServiceSelection,
): RuntimeServiceAssembly {
  const services = new Map<string, { readonly package: RuntimeServicePackage; readonly service: RuntimeService }>();
  const packageNames = new Set<string>();
  for (const item of packages) {
    verifyRuntimeServicePackage(item);
    assert(!packageNames.has(item.name), `Runtime service package ${item.name} is configured twice`);
    packageNames.add(item.name);
    for (const service of item.services) {
      assert(!services.has(service.instance.id), `Runtime service instance ${service.instance.id} is configured twice`);
      services.set(service.instance.id, { package: item, service });
    }
  }
  const scheduler = selectedService(services, selection.scheduler, "scheduler")!;
  const build = selectedService(services, selection.stores.build, "build-store");
  const operations = selectedService(services, selection.stores.operations, "operation-store");
  const artifacts = selectedService(services, selection.stores.artifacts, "artifact-store");
  const credentials = selectedService(services, selection.stores.credentials, "credential-store");
  const selected = [scheduler, build, operations, artifacts, credentials]
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  const selectedPackages = [...new Set(selected.map((item) => item.package))];
  let closed = false;
  return {
    manifests: selectedPackages.map((item) => item.manifest),
    instances: selected.map((item) => item.service.instance),
    scheduler: scheduler.service.service,
    ...(build === undefined ? {} : { buildStore: build.service.service }),
    ...(operations === undefined ? {} : { operationStore: operations.service.service }),
    ...(artifacts === undefined ? {} : { artifactStore: artifacts.service.service }),
    ...(credentials === undefined ? {} : { credentialStore: credentials.service.service }),
    async close() {
      if (closed) return;
      closed = true;
      for (const item of [...packages].reverse()) await item.close?.();
    },
  };
}
