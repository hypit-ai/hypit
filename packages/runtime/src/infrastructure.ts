import type { ModuleRef } from "@narratage/protocol";

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
  RuntimeFacetInstance,
  RuntimePartRole,
} from "./profile.js";
import type {
  ArtifactStore,
  BuildSchedulerFactory,
  BuildStore,
  RuntimeWorkerFactory,
} from "./types.js";

type RuntimePartBase<Role extends RuntimePartRole, Implementation> = {
  readonly role: Role;
  /** Configured infrastructure instance that owns this part. */
  readonly owner: string;
  /** Stable part name exported by that configured instance. */
  readonly part: string;
  readonly instance: RuntimeFacetInstance;
  readonly port: Implementation;
};

export type RuntimeSchedulerPart = RuntimePartBase<"scheduler", BuildSchedulerFactory>;
export type RuntimeWorkerPart = RuntimePartBase<"worker", RuntimeWorkerFactory>;
export type RuntimeBuildStorePart = RuntimePartBase<"build-store", BuildStore>;
export type RuntimeOperationStorePart = RuntimePartBase<"operation-store", OperationStore>;
export type RuntimeDispatchStorePart = RuntimePartBase<"dispatch-store", BuildDispatchStore>;
export type RuntimeArtifactStorePart = RuntimePartBase<"artifact-store", ArtifactStore>;
export type RuntimeCredentialStorePart = RuntimePartBase<"credential-store", CredentialStore>;

export type RuntimePart =
  | RuntimeSchedulerPart
  | RuntimeWorkerPart
  | RuntimeBuildStorePart
  | RuntimeOperationStorePart
  | RuntimeDispatchStorePart
  | RuntimeArtifactStorePart
  | RuntimeCredentialStorePart;

/** One configured infrastructure instance may expose several exact Runtime parts. */
export type RuntimeInfrastructurePackage = {
  /** Configured infrastructure instance created from the Runtime Profile. */
  readonly instance: string;
  readonly manifest: RuntimeModuleManifest;
  readonly parts: readonly RuntimePart[];
  /** Optional Host-facing index owned by the same durable Build store; never part of Runtime selection. */
  readonly buildCatalog?: BuildCatalog;
  close?(): void | Promise<void>;
};

type RuntimePartDefinitionBase<Role extends RuntimePartRole, Implementation> = {
  readonly role: Role;
  readonly part: string;
  readonly facet: string;
  readonly port: Implementation;
};

export type RuntimePartDefinition =
  | RuntimePartDefinitionBase<"scheduler", BuildSchedulerFactory>
  | RuntimePartDefinitionBase<"worker", RuntimeWorkerFactory>
  | RuntimePartDefinitionBase<"build-store", BuildStore>
  | RuntimePartDefinitionBase<"operation-store", OperationStore>
  | RuntimePartDefinitionBase<"dispatch-store", BuildDispatchStore>
  | RuntimePartDefinitionBase<"artifact-store", ArtifactStore>
  | RuntimePartDefinitionBase<"credential-store", CredentialStore>;

export type DefineRuntimeInfrastructurePackageOptions = {
  readonly module: ModuleRef;
  readonly instance: string;
  readonly parts: readonly RuntimePartDefinition[];
  /** Host presentation index co-owned with this package's BuildStore, if any. */
  readonly buildCatalog?: BuildCatalog;
  readonly close?: () => void | Promise<void>;
};

export type RuntimePartReference = {
  readonly from: string;
  readonly part: string;
};

export type RuntimeRoleSelection = {
  readonly scheduler: RuntimePartReference;
  readonly worker: RuntimePartReference;
  readonly buildStore: RuntimePartReference;
  readonly operationStore: RuntimePartReference;
  readonly dispatchStore: RuntimePartReference;
  readonly artifactStore: RuntimePartReference;
  readonly credentialStores: readonly RuntimePartReference[];
};

export type RuntimeInfrastructureAssembly = {
  readonly manifests: readonly RuntimeModuleManifest[];
  readonly instances: readonly RuntimeFacetInstance[];
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

function partFacetKey(part: RuntimePart): string {
  const ref = part.instance.facet;
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

function callable(value: object, name: string, subject: string): void {
  assert(name in value && typeof (value as Record<string, unknown>)[name] === "function",
    `${subject} does not implement ${name}()`);
}

function verifyPartPort(part: RuntimePart): void {
  assert(typeof part.port === "object" && part.port !== null,
    `${part.instance.id} Runtime infrastructure implementation is invalid`);
  switch (part.role) {
    case "scheduler":
      callable(part.port, "create", part.instance.id);
      break;
    case "worker":
      callable(part.port, "create", part.instance.id);
      break;
    case "build-store":
      callable(part.port, "create", part.instance.id);
      callable(part.port, "read", part.instance.id);
      callable(part.port, "append", part.instance.id);
      break;
    case "operation-store":
      callable(part.port, "create", part.instance.id);
      callable(part.port, "read", part.instance.id);
      callable(part.port, "list", part.instance.id);
      callable(part.port, "update", part.instance.id);
      break;
    case "dispatch-store":
      for (const method of [
        "create", "read", "list", "claim", "release", "finish", "requestCancellation", "wake",
        "acquireCapacity", "releaseCapacity", "releaseBuildCapacity", "listCapacity",
      ]) callable(part.port, method, part.instance.id);
      break;
    case "artifact-store":
      callable(part.port, "put", part.instance.id);
      callable(part.port, "get", part.instance.id);
      callable(part.port, "has", part.instance.id);
      break;
    case "credential-store":
      callable(part.port, "resolve", part.instance.id);
      break;
  }
}

export function defineRuntimeInfrastructurePackage(
  options: DefineRuntimeInfrastructurePackageOptions,
): RuntimeInfrastructurePackage {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Runtime infrastructure module identity is invalid");
  assert(options.instance.trim().length > 0, "Runtime infrastructure instance is empty");
  assert(options.parts.length > 0, "Runtime infrastructure package is empty");
  const partNames = new Set<string>();
  const facets = new Set<string>();
  const parts = options.parts.map((definition): RuntimePart => {
    assert(definition.part.trim().length > 0, "Runtime infrastructure part is empty");
    assert(definition.facet.trim().length > 0, "Runtime infrastructure facet is empty");
    assert(!partNames.has(definition.part), `Runtime infrastructure part ${definition.part} is duplicated`);
    assert(!facets.has(definition.facet), `Runtime infrastructure facet ${definition.facet} is duplicated`);
    partNames.add(definition.part);
    facets.add(definition.facet);
    return {
      role: definition.role,
      owner: options.instance,
      part: definition.part,
      instance: {
        id: `${options.instance}.${definition.part}`,
        facet: { module: { ...options.module }, name: definition.facet },
      },
      port: definition.port,
    } as RuntimePart;
  });
  const manifest: RuntimeModuleManifest = {
    format: "narratage.runtime-module@1",
    name: options.module.name,
    version: options.module.version,
    facets: options.parts.map((definition) => ({
      name: definition.facet,
      role: definition.role,
    })),
  };
  const result: RuntimeInfrastructurePackage = {
    instance: options.instance,
    manifest,
    parts,
    ...(options.buildCatalog === undefined ? {} : { buildCatalog: options.buildCatalog }),
    ...(options.close === undefined ? {} : { close: options.close }),
  };
  verifyRuntimeInfrastructurePackage(result);
  return result;
}

export function verifyRuntimeInfrastructurePackage(value: RuntimeInfrastructurePackage): void {
  const packageName = `${value.manifest.name}@${value.manifest.version}`;
  assert(value.instance.trim().length > 0, `${packageName} infrastructure instance is empty`);
  assert(value.parts.length > 0, `${packageName} contains no Runtime infrastructure`);
  const modules = new RuntimeModuleRegistry();
  modules.register(value.manifest);
  const ids = new Set<string>();
  const parts = new Set<string>();
  const claimedFacets = new Set<string>();
  for (const part of value.parts) {
    assert(part.owner === value.instance,
      `${packageName} part ${part.instance.id} belongs to another infrastructure instance`);
    assert(part.part.trim().length > 0, `${packageName} Runtime infrastructure part is empty`);
    assert(!parts.has(part.part), `${packageName} repeats Runtime infrastructure part ${part.part}`);
    parts.add(part.part);
    assert(part.instance.id.trim().length > 0, `${packageName} Runtime infrastructure instance is empty`);
    assert(part.instance.id === `${part.owner}.${part.part}`,
      `${packageName} part ${part.part} has a non-canonical instance id`);
    assert(!ids.has(part.instance.id), `${packageName} repeats Runtime infrastructure ${part.instance.id}`);
    ids.add(part.instance.id);
    verifyPartPort(part);
    const resolved = modules.resolve(part.instance.facet);
    assert(resolved !== undefined, `${packageName} part ${part.instance.id} has no Manifest facet`);
    assert(resolved.facet.role === part.role,
      `${packageName} part ${part.instance.id} role differs from its Manifest facet`);
    claimedFacets.add(partFacetKey(part));
  }
  for (const facet of value.manifest.facets) {
    assert(facet.role !== "capability-endpoint", `${packageName} Runtime infrastructure Manifest contains an Endpoint facet`);
    const key = `${value.manifest.name}@${value.manifest.version}#${facet.name}`;
    assert(claimedFacets.has(key), `${packageName} Manifest facet ${facet.name} has no configured part`);
  }
}

type SelectedRuntimePart<Role extends RuntimePartRole> = {
  readonly package: RuntimeInfrastructurePackage;
  readonly part: Extract<RuntimePart, { readonly role: Role }>;
};

function selectedPart<Role extends RuntimePartRole>(
  parts: ReadonlyMap<string, { readonly package: RuntimeInfrastructurePackage; readonly part: RuntimePart }>,
  reference: RuntimePartReference | undefined,
  role: Role,
): SelectedRuntimePart<Role> | undefined {
  if (reference === undefined) return undefined;
  const key = `${reference.from}\u0000${reference.part}`;
  const selected = parts.get(key);
  assert(selected !== undefined, `Runtime role refers to unknown part ${reference.from}.${reference.part}`);
  assert(selected.part.role === role,
    `Runtime part ${reference.from}.${reference.part} is ${selected.part.role}, not ${role}`);
  return selected as SelectedRuntimePart<Role>;
}

/** Resolve exact configured infrastructure parts without giving any package routing authority. */
export function assembleRuntimeInfrastructure(
  packages: readonly RuntimeInfrastructurePackage[],
  selection: RuntimeRoleSelection,
): RuntimeInfrastructureAssembly {
  const parts = new Map<string, { readonly package: RuntimeInfrastructurePackage; readonly part: RuntimePart }>();
  for (const item of packages) {
    verifyRuntimeInfrastructurePackage(item);
    for (const part of item.parts) {
      const key = `${part.owner}\u0000${part.part}`;
      assert(!parts.has(key), `Runtime part ${part.owner}.${part.part} is configured twice`);
      parts.set(key, { package: item, part });
    }
  }
  const scheduler = selectedPart(parts, selection.scheduler, "scheduler")!;
  const worker = selectedPart(parts, selection.worker, "worker")!;
  const build = selectedPart(parts, selection.buildStore, "build-store");
  const operations = selectedPart(parts, selection.operationStore, "operation-store");
  const dispatch = selectedPart(parts, selection.dispatchStore, "dispatch-store");
  const artifacts = selectedPart(parts, selection.artifactStore, "artifact-store");
  const credentialParts = selection.credentialStores
    .map((reference) => selectedPart(parts, reference, "credential-store")!);
  const selected = [scheduler, worker, build, operations, dispatch, artifacts, ...credentialParts]
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  const selectedPackages = [...new Set(selected.map((item) => item.package))];
  let closed = false;
  return {
    manifests: selectedPackages.map((item) => item.manifest),
    instances: selected.map((item) => item.part.instance),
    scheduler: scheduler.part.port,
    worker: worker.part.port,
    buildStore: build!.part.port,
    operationStore: operations!.part.port,
    dispatchStore: dispatch!.part.port,
    artifactStore: artifacts!.part.port,
    credentialStore: new CompositeCredentialStore(credentialParts.map((item) => item.part.port)),
    async close() {
      if (closed) return;
      closed = true;
      for (const item of [...packages].reverse()) await item.close?.();
    },
  };
}
