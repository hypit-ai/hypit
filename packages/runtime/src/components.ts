import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CanonicalValue, Digest, ModuleRef } from "@narratage/protocol";

import { CompositeCredentialStore } from "./credentials.js";
import type { CredentialStore } from "./credentials.js";
import type { BuildCatalog } from "./catalog.js";
import type { BuildDispatchStore } from "./dispatch.js";
import type { OperationStore } from "./operations.js";
import {
  RuntimeModuleRegistry,
} from "./profile.js";
import type {
  RuntimeModuleManifest,
  RuntimeProfileInstance,
  RuntimeComponentFacetRole,
} from "./profile.js";
import type {
  ArtifactStore,
  BuildSchedulerFactory,
  BuildStore,
  RuntimeWorkerFactory,
} from "./types.js";

type RuntimeComponentBase<Role extends RuntimeComponentFacetRole, Implementation> = {
  readonly role: Role;
  readonly instance: RuntimeProfileInstance;
  readonly port: Implementation;
};

export type RuntimeSchedulerComponent = RuntimeComponentBase<"scheduler", BuildSchedulerFactory>;
export type RuntimeWorkerComponent = RuntimeComponentBase<"worker", RuntimeWorkerFactory>;
export type RuntimeBuildStoreComponent = RuntimeComponentBase<"build-store", BuildStore>;
export type RuntimeOperationStoreComponent = RuntimeComponentBase<"operation-store", OperationStore>;
export type RuntimeDispatchStoreComponent = RuntimeComponentBase<"dispatch-store", BuildDispatchStore>;
export type RuntimeArtifactStoreComponent = RuntimeComponentBase<"artifact-store", ArtifactStore>;
export type RuntimeCredentialStoreComponent = RuntimeComponentBase<"credential-store", CredentialStore>;

export type RuntimeComponent =
  | RuntimeSchedulerComponent
  | RuntimeWorkerComponent
  | RuntimeBuildStoreComponent
  | RuntimeOperationStoreComponent
  | RuntimeDispatchStoreComponent
  | RuntimeArtifactStoreComponent
  | RuntimeCredentialStoreComponent;

/** One configured deployment package may expose several exact Runtime Components. */
export type RuntimeComponentPackage = {
  readonly manifest: RuntimeModuleManifest;
  readonly components: readonly RuntimeComponent[];
  /** Optional Host-facing index owned by the same durable Build store; never part of Runtime selection. */
  readonly buildCatalog?: BuildCatalog;
  close?(): void | Promise<void>;
};

type RuntimeComponentDefinitionBase<Role extends RuntimeComponentFacetRole, Implementation> = {
  readonly role: Role;
  readonly facet: string;
  readonly instance: string;
  readonly implementation: {
    readonly digest: Digest;
  };
  readonly configuration?: CanonicalValue;
  readonly port: Implementation;
};

export type RuntimeComponentDefinition =
  | RuntimeComponentDefinitionBase<"scheduler", BuildSchedulerFactory>
  | RuntimeComponentDefinitionBase<"worker", RuntimeWorkerFactory>
  | RuntimeComponentDefinitionBase<"build-store", BuildStore>
  | RuntimeComponentDefinitionBase<"operation-store", OperationStore>
  | RuntimeComponentDefinitionBase<"dispatch-store", BuildDispatchStore>
  | RuntimeComponentDefinitionBase<"artifact-store", ArtifactStore>
  | RuntimeComponentDefinitionBase<"credential-store", CredentialStore>;

export type DefineRuntimeComponentPackageOptions = {
  readonly module: ModuleRef;
  readonly components: readonly RuntimeComponentDefinition[];
  /** Host presentation index co-owned with this package's BuildStore, if any. */
  readonly buildCatalog?: BuildCatalog;
  readonly close?: () => void | Promise<void>;
};

export type RuntimeBindings = {
  readonly scheduler: string;
  readonly worker: string;
  readonly stores: {
    readonly build: string;
    readonly operations: string;
    readonly dispatch: string;
    readonly artifacts: string;
    readonly credentials: readonly string[];
  };
};

export type RuntimeComponentAssembly = {
  readonly manifests: readonly RuntimeModuleManifest[];
  readonly instances: readonly RuntimeProfileInstance[];
  readonly scheduler: BuildSchedulerFactory;
  readonly worker: RuntimeWorkerFactory;
  readonly buildStore: BuildStore;
  readonly operationStore: OperationStore;
  readonly dispatchStore: BuildDispatchStore;
  readonly artifactStore: ArtifactStore;
  readonly credentialStore: CredentialStore;
  close(): Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function componentFacetKey(component: RuntimeComponent): string {
  const ref = component.instance.facet;
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

function callable(value: object, name: string, subject: string): void {
  assert(name in value && typeof (value as Record<string, unknown>)[name] === "function",
    `${subject} does not implement ${name}()`);
}

function verifyComponentPort(component: RuntimeComponent): void {
  assert(typeof component.port === "object" && component.port !== null,
    `${component.instance.id} Runtime Component implementation is invalid`);
  switch (component.role) {
    case "scheduler":
      callable(component.port, "create", component.instance.id);
      break;
    case "worker":
      callable(component.port, "create", component.instance.id);
      break;
    case "build-store":
      callable(component.port, "create", component.instance.id);
      callable(component.port, "read", component.instance.id);
      callable(component.port, "compareAndSwap", component.instance.id);
      break;
    case "operation-store":
      callable(component.port, "create", component.instance.id);
      callable(component.port, "read", component.instance.id);
      callable(component.port, "list", component.instance.id);
      callable(component.port, "compareAndSwap", component.instance.id);
      break;
    case "dispatch-store":
      for (const method of [
        "create", "read", "list", "claim", "heartbeat", "release", "finish", "requestCancellation", "wake",
        "acquireCapacity", "heartbeatCapacity", "parkCapacity", "releaseCapacity", "clearCapacity", "listCapacity",
      ]) callable(component.port, method, component.instance.id);
      break;
    case "artifact-store":
      callable(component.port, "put", component.instance.id);
      callable(component.port, "get", component.instance.id);
      callable(component.port, "has", component.instance.id);
      break;
    case "credential-store":
      callable(component.port, "resolve", component.instance.id);
      break;
  }
}

export function defineRuntimeComponentPackage(
  options: DefineRuntimeComponentPackageOptions,
): RuntimeComponentPackage {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Runtime Component module identity is invalid");
  assert(options.components.length > 0, "Runtime Component package is empty");
  const instances = new Set<string>();
  const facets = new Set<string>();
  const components = options.components.map((definition): RuntimeComponent => {
    assert(definition.facet.trim().length > 0, "Runtime Component facet is empty");
    assert(definition.instance.trim().length > 0, "Runtime Component instance is empty");
    assert(!instances.has(definition.instance), `Runtime Component instance ${definition.instance} is duplicated`);
    assert(!facets.has(definition.facet), `Runtime Component facet ${definition.facet} is duplicated`);
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
      port: definition.port,
    } as RuntimeComponent;
  });
  const manifest: RuntimeModuleManifest = {
    format: "svml.runtime-module@1",
    name: options.module.name,
    version: options.module.version,
    facets: options.components.map((definition) => ({
      name: definition.facet,
      role: definition.role,
      implementation: { ...definition.implementation },
    })),
  };
  const result: RuntimeComponentPackage = {
    manifest,
    components,
    ...(options.buildCatalog === undefined ? {} : { buildCatalog: options.buildCatalog }),
    ...(options.close === undefined ? {} : { close: options.close }),
  };
  verifyRuntimeComponentPackage(result);
  return result;
}

export function verifyRuntimeComponentPackage(value: RuntimeComponentPackage): void {
  const packageName = `${value.manifest.name}@${value.manifest.version}`;
  assert(value.components.length > 0, `${packageName} contains no Runtime Component`);
  const modules = new RuntimeModuleRegistry();
  modules.register(value.manifest);
  const ids = new Set<string>();
  const claimedFacets = new Set<string>();
  for (const component of value.components) {
    assert(component.instance.id.trim().length > 0, `${packageName} Runtime Component instance is empty`);
    assert(!ids.has(component.instance.id), `${packageName} repeats Runtime Component ${component.instance.id}`);
    ids.add(component.instance.id);
    assert(isDigest(component.instance.configurationDigest),
      `${packageName} component ${component.instance.id} configuration digest is invalid`);
    verifyComponentPort(component);
    const resolved = modules.resolve(component.instance.facet);
    assert(resolved !== undefined, `${packageName} component ${component.instance.id} has no Manifest facet`);
    assert(resolved.facet.role === component.role,
      `${packageName} component ${component.instance.id} role differs from its Manifest facet`);
    claimedFacets.add(componentFacetKey(component));
  }
  for (const facet of value.manifest.facets) {
    assert(facet.role !== "capability-endpoint", `${packageName} Runtime Component Manifest contains an Endpoint facet`);
    const key = `${value.manifest.name}@${value.manifest.version}#${facet.name}`;
    assert(claimedFacets.has(key), `${packageName} Manifest facet ${facet.name} has no configured component`);
  }
}

type SelectedRuntimeComponent<Role extends RuntimeComponentFacetRole> = {
  readonly package: RuntimeComponentPackage;
  readonly component: Extract<RuntimeComponent, { readonly role: Role }>;
};

function selectedComponent<Role extends RuntimeComponentFacetRole>(
  components: ReadonlyMap<string, { readonly package: RuntimeComponentPackage; readonly component: RuntimeComponent }>,
  id: string | undefined,
  role: Role,
): SelectedRuntimeComponent<Role> | undefined {
  if (id === undefined) return undefined;
  const selected = components.get(id);
  assert(selected !== undefined, `Runtime Component selection refers to unknown instance ${id}`);
  assert(selected.component.role === role, `Runtime Component ${id} is ${selected.component.role}, not ${role}`);
  return selected as SelectedRuntimeComponent<Role>;
}

/** Resolve exact configured Component instances without giving any package routing authority. */
export function assembleRuntimeComponents(
  packages: readonly RuntimeComponentPackage[],
  selection: RuntimeBindings,
): RuntimeComponentAssembly {
  const components = new Map<string, { readonly package: RuntimeComponentPackage; readonly component: RuntimeComponent }>();
  for (const item of packages) {
    verifyRuntimeComponentPackage(item);
    for (const component of item.components) {
      assert(!components.has(component.instance.id), `Runtime Component instance ${component.instance.id} is configured twice`);
      components.set(component.instance.id, { package: item, component });
    }
  }
  const scheduler = selectedComponent(components, selection.scheduler, "scheduler")!;
  const worker = selectedComponent(components, selection.worker, "worker")!;
  const build = selectedComponent(components, selection.stores.build, "build-store");
  const operations = selectedComponent(components, selection.stores.operations, "operation-store");
  const dispatch = selectedComponent(components, selection.stores.dispatch, "dispatch-store");
  const artifacts = selectedComponent(components, selection.stores.artifacts, "artifact-store");
  const credentialComponents = selection.stores.credentials.map((id) => selectedComponent(components, id, "credential-store")!);
  const selected = [scheduler, worker, build, operations, dispatch, artifacts, ...credentialComponents]
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  const selectedPackages = [...new Set(selected.map((item) => item.package))];
  let closed = false;
  return {
    manifests: selectedPackages.map((item) => item.manifest),
    instances: selected.map((item) => item.component.instance),
    scheduler: scheduler.component.port,
    worker: worker.component.port,
    buildStore: build!.component.port,
    operationStore: operations!.component.port,
    dispatchStore: dispatch!.component.port,
    artifactStore: artifacts!.component.port,
    credentialStore: new CompositeCredentialStore(credentialComponents.map((item) => item.component.port)),
    async close() {
      if (closed) return;
      closed = true;
      for (const item of [...packages].reverse()) await item.close?.();
    },
  };
}
