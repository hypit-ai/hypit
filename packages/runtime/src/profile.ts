import { plannedNeeds } from "@narratage/core";
import type {
  BuildState,
  CapabilityRef,
  ModuleRef,
  TypeRef,
} from "@narratage/protocol";

export type RuntimeFacetRole =
  | "scheduler"
  | "worker"
  | "build-store"
  | "operation-store"
  | "dispatch-store"
  | "artifact-store"
  | "credential-store"
  | "capability-endpoint";

export type RuntimePartRole = Exclude<RuntimeFacetRole, "capability-endpoint">;

export type RuntimeFacetRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type RuntimeCapability = {
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
};

export type RuntimePartFacet = {
  readonly name: string;
  readonly role: RuntimePartRole;
};

export type RuntimeEndpointFacet = {
  readonly name: string;
  readonly role: "capability-endpoint";
  readonly fulfills: readonly RuntimeCapability[];
  readonly lifecycle: "immediate" | "recoverable";
  readonly defaultConcurrency: number;
  /** Provider-local lanes. When omitted, each capability inherits the Provider total. */
  readonly lanes?: readonly (RuntimeCapability & {
    readonly lane: string;
    readonly maxConcurrency: number;
  })[];
  /** Named secret inputs. Values are resolved by the selected CredentialStore only at invocation. */
  readonly credentialSlots?: readonly string[];
};

export type RuntimeFacet = RuntimePartFacet | RuntimeEndpointFacet;

/** Static package metadata. Reading it must never execute the implementation it describes. */
export type RuntimeModuleManifest = {
  readonly format: "narratage.runtime-module@1";
  readonly name: string;
  readonly version: string;
  readonly facets: readonly RuntimeFacet[];
};

export type RuntimeFacetInstance = {
  readonly id: string;
  readonly facet: RuntimeFacetRef;
  /** Required for capability Endpoints; absent for Scheduler and Store instances. */
  readonly pool?: string;
};

export type EndpointOffer = RuntimeCapability & {
  readonly endpoint: string;
};

export type ResolvedRuntimeProfile = {
  readonly format: "narratage.resolved-runtime@1";
  readonly instances: readonly RuntimeFacetInstance[];
  readonly scheduler: string;
  readonly worker: string;
  readonly stores: {
    readonly build: string;
    readonly operations: string;
    readonly dispatch: string;
    readonly artifacts: string;
    readonly credentials: readonly string[];
  };
  readonly endpoints: readonly EndpointOffer[];
  readonly scheduling: {
    readonly maxConcurrency: number;
    readonly resources: readonly { readonly id: string; readonly maxConcurrency: number }[];
  };
};

export type ResolvedRuntimePart = {
  readonly id: string;
  readonly role: RuntimePartRole;
  readonly facet: RuntimeFacetRef;
};

export type ResolvedRuntimeEndpoint = {
  readonly id: string;
  readonly role: "capability-endpoint";
  readonly facet: RuntimeFacetRef;
  readonly fulfills: readonly RuntimeCapability[];
  readonly lifecycle: "immediate" | "recoverable";
  readonly credentialSlots: readonly string[];
  readonly pool: string;
  readonly maxConcurrency: number;
  readonly lanes: readonly (RuntimeCapability & {
    readonly lane: string;
    readonly maxConcurrency: number;
  })[];
};

export type ResolvedRuntimeInstance = ResolvedRuntimePart | ResolvedRuntimeEndpoint;

export type RuntimeClosure = {
  readonly format: "narratage.runtime-closure@1";
  readonly instances: readonly ResolvedRuntimeInstance[];
  readonly scheduler: string;
  readonly worker: string;
  readonly stores: ResolvedRuntimeProfile["stores"];
  readonly endpoints: readonly EndpointOffer[];
  readonly scheduling: ResolvedRuntimeProfile["scheduling"];
};

type RegisteredRuntimeModule = {
  readonly manifest: RuntimeModuleManifest;
  readonly facets: ReadonlyMap<string, RuntimeFacet>;
};

const runtimeInstanceIndexes = new WeakMap<RuntimeClosure, ReadonlyMap<string, ResolvedRuntimeInstance>>();

function runtimeInstances(closure: RuntimeClosure): ReadonlyMap<string, ResolvedRuntimeInstance> {
  const existing = runtimeInstanceIndexes.get(closure);
  if (existing !== undefined) return existing;
  const created = new Map(closure.instances.map((instance) => [instance.id, instance]));
  runtimeInstanceIndexes.set(closure, created);
  return created;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

function moduleKey(module: ModuleRef): string {
  return `${module.name}@${module.version}`;
}

function facetKey(ref: RuntimeFacetRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

function capabilityKey(capability: CapabilityRef): string {
  return `${moduleKey(capability.module)}#${capability.name}`;
}

function typeKey(type: TypeRef): string {
  return `${moduleKey(type.module)}#${type.name}`;
}

function offerKey(offer: RuntimeCapability): string {
  return `${capabilityKey(offer.capability)} -> ${typeKey(offer.returns)}`;
}

function sameModule(left: ModuleRef, right: ModuleRef): boolean {
  return left.name === right.name && left.version === right.version;
}

function sortedUniqueStrings(values: readonly string[], subject: string): readonly string[] {
  const sorted = [...values].map((value) => {
    assert(value.trim().length > 0, `${subject} contains an empty value`);
    return value;
  }).sort();
  assert(new Set(sorted).size === sorted.length, `${subject} contains a duplicate value`);
  return sorted;
}

function normalizeCapability(value: RuntimeCapability): RuntimeCapability {
  assert(value.capability.module.name.length > 0 && value.capability.module.version.length > 0, "runtime capability module is invalid");
  assert(value.capability.name.length > 0, "runtime capability name is empty");
  assert(value.returns.module.name.length > 0 && value.returns.module.version.length > 0, "runtime return type module is invalid");
  assert(value.returns.name.length > 0, "runtime return type name is empty");
  return {
    capability: {
      module: { ...value.capability.module },
      name: value.capability.name,
    },
    returns: {
      module: { ...value.returns.module },
      name: value.returns.name,
    },
  };
}

function normalizeFacet(facet: RuntimeFacet): RuntimeFacet {
  assert(facet.name.trim().length > 0, "runtime facet name is empty");
  const common = {
    name: facet.name,
  };
  if (facet.role !== "capability-endpoint") return { ...common, role: facet.role };
  const fulfills = facet.fulfills.map(normalizeCapability)
    .sort((left, right) => offerKey(left).localeCompare(offerKey(right)));
  assert(fulfills.length > 0, `${facet.name} must fulfill at least one exact capability`);
  assert(new Set(fulfills.map(offerKey)).size === fulfills.length, `${facet.name} repeats a capability offer`);
  assert(facet.lifecycle === "immediate" || facet.lifecycle === "recoverable", `${facet.name} lifecycle is invalid`);
  const defaultConcurrency = positiveInteger(facet.defaultConcurrency, `${facet.name} defaultConcurrency`);
  const lanes = (facet.lanes ?? fulfills.map((item) => ({
    ...item,
    lane: capabilityKey(item.capability),
    maxConcurrency: defaultConcurrency,
  }))).map((item) => ({
    ...normalizeCapability(item),
    lane: item.lane,
    maxConcurrency: positiveInteger(item.maxConcurrency, `${facet.name} lane ${item.lane}`),
  })).sort((left, right) => offerKey(left).localeCompare(offerKey(right)));
  assert(lanes.every((item) => item.lane.trim().length > 0), `${facet.name} has an empty lane`);
  assert(JSON.stringify(lanes.map(offerKey)) === JSON.stringify(fulfills.map(offerKey)),
    `${facet.name} lanes must cover every fulfilled capability exactly once`);
  const laneConcurrency = new Map<string, number>();
  for (const item of lanes) {
    const previous = laneConcurrency.get(item.lane);
    assert(previous === undefined || previous === item.maxConcurrency,
      `${facet.name} lane ${item.lane} has conflicting concurrency limits`);
    laneConcurrency.set(item.lane, item.maxConcurrency);
  }
  return {
    ...common,
    role: "capability-endpoint",
    fulfills,
    lifecycle: facet.lifecycle,
    defaultConcurrency,
    lanes,
    credentialSlots: sortedUniqueStrings(facet.credentialSlots ?? [], `${facet.name} credential slots`),
  };
}

function normalizeManifest(manifest: RuntimeModuleManifest): RuntimeModuleManifest {
  assert(manifest.format === "narratage.runtime-module@1", "unsupported Runtime Module Manifest format");
  assert(manifest.name.trim().length > 0 && manifest.version.trim().length > 0, "runtime module identity is invalid");
  const facets = manifest.facets.map(normalizeFacet).sort((left, right) => left.name.localeCompare(right.name));
  assert(new Set(facets.map((facet) => facet.name)).size === facets.length, `${manifest.name} repeats a Runtime facet`);
  return {
    format: "narratage.runtime-module@1",
    name: manifest.name,
    version: manifest.version,
    facets,
  };
}

export class RuntimeModuleRegistry {
  readonly #modules = new Map<string, RegisteredRuntimeModule>();

  register(manifest: RuntimeModuleManifest): void {
    const normalized = normalizeManifest(manifest);
    const key = moduleKey(normalized);
    assert(!this.#modules.has(key), `runtime module ${key} is already registered`);
    this.#modules.set(key, {
      manifest: normalized,
      facets: new Map(normalized.facets.map((facet) => [facet.name, facet])),
    });
  }

  resolve(ref: RuntimeFacetRef): { readonly module: RegisteredRuntimeModule; readonly facet: RuntimeFacet } | undefined {
    const registered = this.#modules.get(moduleKey(ref.module));
    const facet = registered?.facets.get(ref.name);
    return registered === undefined || facet === undefined ? undefined : { module: registered, facet };
  }

  verifyClosure(closure: RuntimeClosure): void {
    verifyRuntimeClosure(closure);
    for (const instance of closure.instances) {
      const resolved = this.resolve(instance.facet);
      assert(resolved !== undefined, `Runtime facet ${facetKey(instance.facet)} is not registered`);
      assert(instance.role === resolved.facet.role, `${instance.id} Runtime facet role differs`);
      if (instance.role === "capability-endpoint" && resolved.facet.role === "capability-endpoint") {
        assert(instance.lifecycle === resolved.facet.lifecycle, `${instance.id} Endpoint lifecycle differs`);
        assert(JSON.stringify(instance.credentialSlots)
          === JSON.stringify(resolved.facet.credentialSlots ?? []), `${instance.id} Endpoint credential slots differ`);
        assert(JSON.stringify(instance.fulfills.map(offerKey))
          === JSON.stringify(resolved.facet.fulfills.map(offerKey)), `${instance.id} Endpoint capabilities differ`);
        assert(instance.maxConcurrency === resolved.facet.defaultConcurrency,
          `${instance.id} Endpoint concurrency differs`);
        assert(JSON.stringify(instance.lanes) === JSON.stringify(resolved.facet.lanes),
          `${instance.id} Endpoint lanes differ`);
      }
    }
  }
}

function resolvedRuntimeContent(profile: ResolvedRuntimeProfile): ResolvedRuntimeProfile {
  return {
    format: "narratage.resolved-runtime@1",
    instances: [...profile.instances]
      .map((instance) => ({
        id: instance.id,
        facet: { module: { ...instance.facet.module }, name: instance.facet.name },
        ...(instance.pool === undefined ? {} : { pool: instance.pool }),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    scheduler: profile.scheduler,
    worker: profile.worker,
    stores: {
      build: profile.stores.build,
      operations: profile.stores.operations,
      dispatch: profile.stores.dispatch,
      artifacts: profile.stores.artifacts,
      credentials: [...profile.stores.credentials].sort(),
    },
    endpoints: [...profile.endpoints]
      .map((offer) => ({ ...normalizeCapability(offer), endpoint: offer.endpoint }))
      .sort((left, right) => offerKey(left).localeCompare(offerKey(right))),
    scheduling: {
      maxConcurrency: profile.scheduling.maxConcurrency,
      resources: [...profile.scheduling.resources]
        .map((resource) => ({ id: resource.id, maxConcurrency: resource.maxConcurrency }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

function verifyResolvedRuntimeShape(profile: ResolvedRuntimeProfile): void {
  assert(profile.format === "narratage.resolved-runtime@1", "unsupported Resolved Runtime format");
  assert(profile.scheduler.trim().length > 0, "Resolved Runtime scheduler is empty");
  assert(profile.worker.trim().length > 0, "Resolved Runtime worker is empty");
  for (const [name, id] of Object.entries({
    build: profile.stores.build,
    operations: profile.stores.operations,
    dispatch: profile.stores.dispatch,
    artifacts: profile.stores.artifacts,
  })) assert(id.trim().length > 0, `Resolved Runtime ${name} store is empty`);
  for (const id of profile.stores.credentials) assert(id.trim().length > 0, "Resolved Runtime CredentialStore id is empty");
  assert(new Set(profile.stores.credentials).size === profile.stores.credentials.length,
    "Resolved Runtime repeats a CredentialStore");
  positiveInteger(profile.scheduling.maxConcurrency, "Resolved Runtime maxConcurrency");
  const ids = profile.instances.map((instance) => {
    assert(instance.id.trim().length > 0, "Resolved Runtime instance id is empty");
    assert(instance.facet.name.trim().length > 0, `${instance.id} facet name is empty`);
    assert(instance.facet.module.name.length > 0 && instance.facet.module.version.length > 0, `${instance.id} facet module is invalid`);
    if (instance.pool !== undefined) assert(instance.pool.trim().length > 0, `${instance.id} pool is empty`);
    return instance.id;
  });
  assert(new Set(ids).size === ids.length, "Resolved Runtime repeats an instance id");
  const offers = profile.endpoints.map((offer) => {
    assert(offer.endpoint.trim().length > 0, "Runtime Endpoint offer endpoint is empty");
    return offerKey(normalizeCapability(offer));
  });
  assert(new Set(offers).size === offers.length, "Resolved Runtime repeats an Endpoint offer");
  const resourceNames = profile.scheduling.resources.map((resource) => {
    assert(resource.id.trim().length > 0, "Resolved Runtime resource id is empty");
    positiveInteger(resource.maxConcurrency, `Runtime resource ${resource.id}`);
    return resource.id;
  });
  assert(new Set(resourceNames).size === resourceNames.length, "Resolved Runtime repeats a resource override");
}

export function sealResolvedRuntimeProfile(
  value: Omit<ResolvedRuntimeProfile, "format">,
): ResolvedRuntimeProfile {
  const draft: ResolvedRuntimeProfile = {
    format: "narratage.resolved-runtime@1",
    ...value,
  };
  verifyResolvedRuntimeShape(draft);
  return resolvedRuntimeContent(draft);
}

export function verifyResolvedRuntimeProfile(profile: ResolvedRuntimeProfile): void {
  verifyResolvedRuntimeShape(profile);
}

export function verifyRuntimeClosure(closure: RuntimeClosure): void {
  assert(closure.format === "narratage.runtime-closure@1", "unsupported Runtime Closure format");
  positiveInteger(closure.scheduling.maxConcurrency, "Runtime Closure maxConcurrency");
  const resourceNames = closure.scheduling.resources.map((resource) => {
    assert(resource.id.trim().length > 0, "Runtime Closure resource id is empty");
    positiveInteger(resource.maxConcurrency, `Runtime Closure resource ${resource.id}`);
    return resource.id;
  });
  assert(new Set(resourceNames).size === resourceNames.length, "Runtime Closure repeats a resource override");
  const instances = new Map<string, ResolvedRuntimeInstance>();
  const endpointOffers = new Map<string, ReadonlySet<string>>();
  for (const instance of closure.instances) {
    assert(!instances.has(instance.id), `Runtime Closure repeats instance ${instance.id}`);
    assert(instance.facet.module.name.trim().length > 0 && instance.facet.module.version.trim().length > 0,
      `${instance.id} Runtime module identity is invalid`);
    assert(instance.facet.name.trim().length > 0, `${instance.id} Runtime facet name is empty`);
    if (instance.role === "capability-endpoint") {
      assert(instance.pool.trim().length > 0, `${instance.id} Endpoint pool is empty`);
      positiveInteger(instance.maxConcurrency, `${instance.id} Endpoint maxConcurrency`);
      assert(instance.fulfills.length > 0, `${instance.id} Endpoint fulfills nothing`);
      const fulfills = new Set(instance.fulfills.map(offerKey));
      assert(fulfills.size === instance.fulfills.length,
        `${instance.id} Endpoint repeats a capability`);
      endpointOffers.set(instance.id, fulfills);
      assert(instance.lanes.length === instance.fulfills.length,
        `${instance.id} Endpoint lanes differ from capabilities`);
      const laneConcurrency = new Map<string, number>();
      for (const lane of instance.lanes) {
        assert(lane.lane.trim().length > 0, `${instance.id} Endpoint lane is empty`);
        positiveInteger(lane.maxConcurrency, `${instance.id} Endpoint lane ${lane.lane}`);
        assert(fulfills.has(offerKey(lane)),
          `${instance.id} Endpoint lane is outside its capabilities`);
        const previous = laneConcurrency.get(lane.lane);
        assert(previous === undefined || previous === lane.maxConcurrency,
          `${instance.id} Endpoint lane ${lane.lane} has conflicting concurrency limits`);
        laneConcurrency.set(lane.lane, lane.maxConcurrency);
      }
      sortedUniqueStrings(instance.credentialSlots, `${instance.id} Endpoint credential slots`);
    }
    instances.set(instance.id, instance);
  }
  const schedulers = closure.instances.filter((instance) => instance.role === "scheduler");
  assert(schedulers.length === 1 && schedulers[0]?.id === closure.scheduler, "Runtime Closure must select exactly one scheduler");
  const workers = closure.instances.filter((instance) => instance.role === "worker");
  assert(workers.length === 1 && workers[0]?.id === closure.worker, "Runtime Closure must select exactly one worker");
  const roles = {
    build: "build-store",
    operations: "operation-store",
    dispatch: "dispatch-store",
    artifacts: "artifact-store",
  } as const;
  for (const [name, role] of Object.entries(roles) as [keyof typeof roles, typeof roles[keyof typeof roles]][]) {
    const id = closure.stores[name];
    assert(instances.get(id)?.role === role, `Runtime Closure ${name} store has the wrong role`);
  }
  for (const id of closure.stores.credentials) {
    assert(instances.get(id)?.role === "credential-store", `Runtime Closure credential store ${id} has the wrong role`);
  }
  for (const offer of closure.endpoints) {
    const endpoint = instances.get(offer.endpoint);
    assert(endpoint?.role === "capability-endpoint", `${offer.endpoint} is not a capability Endpoint`);
    assert(endpointOffers.get(offer.endpoint)?.has(offerKey(offer)), `${offer.endpoint} does not fulfill ${offerKey(offer)}`);
  }
  assert(new Set(closure.endpoints.map(offerKey)).size === closure.endpoints.length,
    "Runtime Closure repeats an Endpoint offer");
  if (closure.instances.some((instance) => instance.role === "capability-endpoint" && instance.lifecycle === "recoverable")) {
    assert(instances.get(closure.stores.operations)?.role === "operation-store", "recoverable Endpoints require an OperationStore");
  }
  if (closure.instances.some((instance) => instance.role === "capability-endpoint" && instance.credentialSlots.length > 0)) {
    assert(closure.stores.credentials.length > 0, "credentialed Endpoints require a CredentialStore");
  }
}

export function resolveRuntimeClosure(
  registry: RuntimeModuleRegistry,
  profile: ResolvedRuntimeProfile,
): RuntimeClosure {
  verifyResolvedRuntimeProfile(profile);
  const instances = profile.instances.map((instance): ResolvedRuntimeInstance => {
    const resolved = registry.resolve(instance.facet);
    assert(resolved !== undefined, `Runtime facet ${facetKey(instance.facet)} is not registered`);
    const common = {
      id: instance.id,
      facet: { module: { ...instance.facet.module }, name: instance.facet.name },
    };
    if (resolved.facet.role !== "capability-endpoint") return { ...common, role: resolved.facet.role };
    assert(instance.pool !== undefined, `${instance.id} Endpoint Provider Pool is required`);
    return {
      ...common,
      role: "capability-endpoint",
      fulfills: resolved.facet.fulfills.map((item) => structuredClone(item)),
      lifecycle: resolved.facet.lifecycle,
      credentialSlots: [...(resolved.facet.credentialSlots ?? [])],
      pool: instance.pool,
      maxConcurrency: resolved.facet.defaultConcurrency,
      lanes: structuredClone(resolved.facet.lanes ?? []),
    };
  });
  const closure: RuntimeClosure = {
    format: "narratage.runtime-closure@1",
    instances,
    scheduler: profile.scheduler,
    worker: profile.worker,
    stores: { ...profile.stores },
    endpoints: profile.endpoints.map((offer) => structuredClone(offer)),
    scheduling: structuredClone(profile.scheduling),
  };
  verifyRuntimeClosure(closure);
  return closure;
}

export function runtimeEndpoint(
  closure: RuntimeClosure,
  id: string,
): ResolvedRuntimeEndpoint | undefined {
  const instance = runtimeInstances(closure).get(id);
  return instance?.role === "capability-endpoint" ? instance : undefined;
}

/** Fail before execution if the selected finite BuildPlan has an unbound external requirement. */
export function verifyRuntimeCoverage(closure: RuntimeClosure, state: BuildState): void {
  verifyRuntimeClosure(closure);
  const offers = new Set(closure.endpoints.map(offerKey));
  for (const requirement of plannedNeeds(state)) {
    assert(
      offers.has(offerKey(requirement)),
      `Runtime Closure does not bind demanded capability ${offerKey(requirement)}`,
    );
  }
}

export function localSchedulerOptionsFromClosure(closure: RuntimeClosure): {
  readonly maxConcurrency: number;
  readonly resourceLimits: Readonly<Record<string, number>>;
  readonly runtimeClosure: RuntimeClosure;
} {
  verifyRuntimeClosure(closure);
  return {
    maxConcurrency: closure.scheduling.maxConcurrency,
    resourceLimits: Object.fromEntries(closure.scheduling.resources.map((resource) => [resource.id, resource.maxConcurrency])),
    runtimeClosure: structuredClone(closure),
  };
}
