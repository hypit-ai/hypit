import { resolveProducer } from "@narratage/core";
import { digestOf, isDigest } from "@narratage/protocol";
import type {
  BuildState,
  CapabilityRef,
  Digest,
  ModuleRef,
  TypeRef,
} from "@narratage/protocol";

export type RuntimeFacetRole =
  | "scheduler"
  | "worker"
  | "build-store"
  | "operation-store"
  | "dispatch-store"
  | "runtime-journal"
  | "artifact-store"
  | "credential-store"
  | "capability-endpoint";

export type RuntimeServiceFacetRole = Exclude<RuntimeFacetRole, "capability-endpoint">;

export type RuntimeFacetRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type RuntimeImplementation = {
  readonly locator: string;
  readonly digest: Digest;
};

export type RuntimeCapability = {
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
};

export type RuntimeServiceFacet = {
  readonly name: string;
  readonly role: RuntimeServiceFacetRole;
  readonly implementation: RuntimeImplementation;
  readonly permissions: readonly string[];
};

export type RuntimeEndpointFacet = {
  readonly name: string;
  readonly role: "capability-endpoint";
  readonly implementation: RuntimeImplementation;
  readonly permissions: readonly string[];
  readonly fulfills: readonly RuntimeCapability[];
  readonly lifecycle: "immediate" | "recoverable";
  readonly defaultConcurrency: number;
  /** Named secret inputs. Values are resolved by the selected CredentialStore only at invocation. */
  readonly credentialSlots?: readonly string[];
};

export type RuntimeFacet = RuntimeServiceFacet | RuntimeEndpointFacet;

/** Static package metadata. Reading it must never execute the implementation it describes. */
export type RuntimeModuleManifest = {
  readonly format: "svml.runtime-module@1";
  readonly name: string;
  readonly version: string;
  readonly facets: readonly RuntimeFacet[];
};

export type RuntimeProfileInstance = {
  readonly id: string;
  readonly facet: RuntimeFacetRef;
  /** Optional authority-wide lane name. The default is endpoint:<instance id>. */
  readonly lane?: string;
  /** Digest of non-secret endpoint/store configuration. Secret bytes must never enter it. */
  readonly configurationDigest?: Digest;
};

export type RuntimeEndpointBinding = RuntimeCapability & {
  readonly endpoint: string;
};

export type RuntimeProfile = {
  readonly format: "svml.runtime-profile@1";
  readonly digest: Digest;
  readonly name: string;
  readonly instances: readonly RuntimeProfileInstance[];
  readonly scheduler: string;
  readonly worker: string;
  readonly stores: {
    readonly build: string;
    readonly operations: string;
    readonly dispatch: string;
    readonly journal: string;
    readonly artifacts: string;
    readonly credentials: readonly string[];
  };
  readonly endpoints: readonly RuntimeEndpointBinding[];
  readonly scheduling: {
    readonly maxConcurrency: number;
    readonly lanes: readonly { readonly name: string; readonly maxConcurrency: number }[];
  };
};

export type ResolvedRuntimeService = {
  readonly id: string;
  readonly role: RuntimeServiceFacetRole;
  readonly facet: RuntimeFacetRef;
  readonly implementation: RuntimeImplementation;
  readonly configurationDigest: Digest;
  readonly permissions: readonly string[];
};

export type ResolvedRuntimeEndpoint = {
  readonly id: string;
  readonly role: "capability-endpoint";
  readonly facet: RuntimeFacetRef;
  readonly implementation: RuntimeImplementation;
  readonly configurationDigest: Digest;
  readonly permissions: readonly string[];
  readonly fulfills: readonly RuntimeCapability[];
  readonly lifecycle: "immediate" | "recoverable";
  readonly credentialSlots: readonly string[];
  readonly lane: string;
  readonly maxConcurrency: number;
};

export type ResolvedRuntimeInstance = ResolvedRuntimeService | ResolvedRuntimeEndpoint;

export type RuntimeClosure = {
  readonly format: "svml.runtime-closure@1";
  readonly digest: Digest;
  readonly profile: Digest;
  readonly modules: readonly { readonly module: ModuleRef; readonly digest: Digest }[];
  readonly instances: readonly ResolvedRuntimeInstance[];
  readonly scheduler: string;
  readonly worker: string;
  readonly stores: RuntimeProfile["stores"];
  readonly endpoints: readonly RuntimeEndpointBinding[];
  readonly scheduling: RuntimeProfile["scheduling"];
};

type RegisteredRuntimeModule = {
  readonly manifest: RuntimeModuleManifest;
  readonly digest: Digest;
};

export type ResolveRuntimeProfileOptions = {
  readonly allowedPermissions?: readonly string[];
};

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

function bindingKey(binding: RuntimeCapability): string {
  return `${capabilityKey(binding.capability)} -> ${typeKey(binding.returns)}`;
}

function sameModule(left: ModuleRef, right: ModuleRef): boolean {
  return left.name === right.name && left.version === right.version;
}

function sameCapability(left: RuntimeCapability, right: RuntimeCapability): boolean {
  return capabilityKey(left.capability) === capabilityKey(right.capability)
    && typeKey(left.returns) === typeKey(right.returns);
}

function sortedUniqueStrings(values: readonly string[], subject: string): readonly string[] {
  const sorted = [...values].map((value) => {
    assert(value.trim().length > 0, `${subject} contains an empty value`);
    return value;
  }).sort();
  assert(new Set(sorted).size === sorted.length, `${subject} contains a duplicate value`);
  return sorted;
}

function normalizeImplementation(value: RuntimeImplementation, subject: string): RuntimeImplementation {
  assert(value.locator.trim().length > 0, `${subject} implementation locator is empty`);
  assert(isDigest(value.digest), `${subject} implementation digest is invalid`);
  return { locator: value.locator, digest: value.digest };
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
    implementation: normalizeImplementation(facet.implementation, facet.name),
    permissions: sortedUniqueStrings(facet.permissions, `${facet.name} permissions`),
  };
  if (facet.role !== "capability-endpoint") return { ...common, role: facet.role };
  const fulfills = facet.fulfills.map(normalizeCapability)
    .sort((left, right) => bindingKey(left).localeCompare(bindingKey(right)));
  assert(fulfills.length > 0, `${facet.name} must fulfill at least one exact capability`);
  assert(new Set(fulfills.map(bindingKey)).size === fulfills.length, `${facet.name} repeats a capability binding`);
  assert(facet.lifecycle === "immediate" || facet.lifecycle === "recoverable", `${facet.name} lifecycle is invalid`);
  return {
    ...common,
    role: "capability-endpoint",
    fulfills,
    lifecycle: facet.lifecycle,
    defaultConcurrency: positiveInteger(facet.defaultConcurrency, `${facet.name} defaultConcurrency`),
    credentialSlots: sortedUniqueStrings(facet.credentialSlots ?? [], `${facet.name} credential slots`),
  };
}

function normalizeManifest(manifest: RuntimeModuleManifest): RuntimeModuleManifest {
  assert(manifest.format === "svml.runtime-module@1", "unsupported Runtime Module Manifest format");
  assert(manifest.name.trim().length > 0 && manifest.version.trim().length > 0, "runtime module identity is invalid");
  const facets = manifest.facets.map(normalizeFacet).sort((left, right) => left.name.localeCompare(right.name));
  assert(new Set(facets.map((facet) => facet.name)).size === facets.length, `${manifest.name} repeats a Runtime facet`);
  return {
    format: "svml.runtime-module@1",
    name: manifest.name,
    version: manifest.version,
    facets,
  };
}

export class RuntimeModuleRegistry {
  readonly #modules = new Map<string, RegisteredRuntimeModule>();

  register(manifest: RuntimeModuleManifest): Digest {
    const normalized = normalizeManifest(manifest);
    const key = moduleKey(normalized);
    assert(!this.#modules.has(key), `runtime module ${key} is already registered`);
    const registered = { manifest: normalized, digest: digestOf(normalized) };
    this.#modules.set(key, registered);
    return registered.digest;
  }

  resolve(ref: RuntimeFacetRef): { readonly module: RegisteredRuntimeModule; readonly facet: RuntimeFacet } | undefined {
    const registered = this.#modules.get(moduleKey(ref.module));
    const facet = registered?.manifest.facets.find((candidate) => candidate.name === ref.name);
    return registered === undefined || facet === undefined ? undefined : { module: registered, facet };
  }

  verifyClosure(closure: RuntimeClosure, options: ResolveRuntimeProfileOptions = {}): void {
    verifyRuntimeClosure(closure);
    const allowed = new Set(options.allowedPermissions ?? []);
    const modules = new Map(closure.modules.map((item) => [moduleKey(item.module), item]));
    for (const instance of closure.instances) {
      const resolved = this.resolve(instance.facet);
      assert(resolved !== undefined, `Runtime facet ${facetKey(instance.facet)} is not registered`);
      assert(modules.get(moduleKey(instance.facet.module))?.digest === resolved.module.digest,
        `${moduleKey(instance.facet.module)} Manifest digest does not match the Runtime Closure`);
      assert(instance.role === resolved.facet.role, `${instance.id} Runtime facet role differs`);
      assert(instance.implementation.locator === resolved.facet.implementation.locator
        && instance.implementation.digest === resolved.facet.implementation.digest,
      `${instance.id} Runtime implementation differs`);
      assert(JSON.stringify(instance.permissions) === JSON.stringify(resolved.facet.permissions),
        `${instance.id} Runtime permissions differ`);
      for (const permission of instance.permissions) {
        assert(allowed.has(permission), `${instance.id} requires disallowed Runtime permission ${permission}`);
      }
      if (instance.role === "capability-endpoint" && resolved.facet.role === "capability-endpoint") {
        assert(instance.lifecycle === resolved.facet.lifecycle, `${instance.id} Endpoint lifecycle differs`);
        assert(JSON.stringify(instance.credentialSlots)
          === JSON.stringify(resolved.facet.credentialSlots ?? []), `${instance.id} Endpoint credential slots differ`);
        assert(JSON.stringify(instance.fulfills.map(bindingKey))
          === JSON.stringify(resolved.facet.fulfills.map(bindingKey)), `${instance.id} Endpoint capabilities differ`);
        const override = closure.scheduling.lanes.find((lane) => lane.name === instance.lane)?.maxConcurrency;
        assert(instance.maxConcurrency === (override ?? resolved.facet.defaultConcurrency),
          `${instance.id} Endpoint concurrency differs`);
      }
    }
  }
}

function profileContent(profile: RuntimeProfile): Omit<RuntimeProfile, "digest"> {
  return {
    format: "svml.runtime-profile@1",
    name: profile.name,
    instances: [...profile.instances]
      .map((instance) => ({
        id: instance.id,
        facet: { module: { ...instance.facet.module }, name: instance.facet.name },
        ...(instance.lane === undefined ? {} : { lane: instance.lane }),
        ...(instance.configurationDigest === undefined
          ? {}
          : { configurationDigest: instance.configurationDigest }),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    scheduler: profile.scheduler,
    worker: profile.worker,
    stores: {
      build: profile.stores.build,
      operations: profile.stores.operations,
      dispatch: profile.stores.dispatch,
      journal: profile.stores.journal,
      artifacts: profile.stores.artifacts,
      credentials: [...profile.stores.credentials].sort(),
    },
    endpoints: [...profile.endpoints]
      .map((binding) => ({ ...normalizeCapability(binding), endpoint: binding.endpoint }))
      .sort((left, right) => bindingKey(left).localeCompare(bindingKey(right))),
    scheduling: {
      maxConcurrency: profile.scheduling.maxConcurrency,
      lanes: [...profile.scheduling.lanes]
        .map((lane) => ({ name: lane.name, maxConcurrency: lane.maxConcurrency }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    },
  };
}

function verifyProfileShape(profile: RuntimeProfile): void {
  assert(profile.format === "svml.runtime-profile@1", "unsupported Runtime Profile format");
  assert(profile.name.trim().length > 0, "Runtime Profile name is empty");
  assert(profile.scheduler.trim().length > 0, "Runtime Profile scheduler is empty");
  assert(profile.worker.trim().length > 0, "Runtime Profile worker is empty");
  for (const [name, id] of Object.entries({
    build: profile.stores.build,
    operations: profile.stores.operations,
    dispatch: profile.stores.dispatch,
    journal: profile.stores.journal,
    artifacts: profile.stores.artifacts,
  })) assert(id.trim().length > 0, `Runtime Profile ${name} store is empty`);
  assert(profile.stores.credentials.length > 0, "Runtime Profile selects no CredentialStore");
  for (const id of profile.stores.credentials) assert(id.trim().length > 0, "Runtime Profile CredentialStore id is empty");
  assert(new Set(profile.stores.credentials).size === profile.stores.credentials.length,
    "Runtime Profile repeats a CredentialStore");
  positiveInteger(profile.scheduling.maxConcurrency, "Runtime Profile maxConcurrency");
  const ids = profile.instances.map((instance) => {
    assert(instance.id.trim().length > 0, "Runtime Profile instance id is empty");
    assert(instance.facet.name.trim().length > 0, `${instance.id} facet name is empty`);
    assert(instance.facet.module.name.length > 0 && instance.facet.module.version.length > 0, `${instance.id} facet module is invalid`);
    if (instance.lane !== undefined) assert(instance.lane.trim().length > 0, `${instance.id} lane is empty`);
    if (instance.configurationDigest !== undefined) {
      assert(isDigest(instance.configurationDigest), `${instance.id} configuration digest is invalid`);
    }
    return instance.id;
  });
  assert(new Set(ids).size === ids.length, "Runtime Profile repeats an instance id");
  const bindings = profile.endpoints.map((binding) => {
    assert(binding.endpoint.trim().length > 0, "Runtime Endpoint binding endpoint is empty");
    return bindingKey(normalizeCapability(binding));
  });
  assert(new Set(bindings).size === bindings.length, "Runtime Profile repeats an Endpoint binding");
  const laneNames = profile.scheduling.lanes.map((lane) => {
    assert(lane.name.trim().length > 0, "Runtime Profile lane name is empty");
    positiveInteger(lane.maxConcurrency, `Runtime lane ${lane.name}`);
    return lane.name;
  });
  assert(new Set(laneNames).size === laneNames.length, "Runtime Profile repeats a lane override");
}

export function sealRuntimeProfile(
  value: Omit<RuntimeProfile, "format" | "digest">,
): RuntimeProfile {
  const draft: RuntimeProfile = {
    format: "svml.runtime-profile@1",
    digest: digestOf("unsealed-runtime-profile"),
    ...value,
  };
  verifyProfileShape(draft);
  const content = profileContent(draft);
  return { ...content, digest: digestOf(content) };
}

export function verifyRuntimeProfile(profile: RuntimeProfile): void {
  verifyProfileShape(profile);
  assert(isDigest(profile.digest) && profile.digest === digestOf(profileContent(profile)), "Runtime Profile digest differs");
}

function closureContent(closure: RuntimeClosure): Omit<RuntimeClosure, "digest"> {
  return {
    format: "svml.runtime-closure@1",
    profile: closure.profile,
    modules: [...closure.modules].map((item) => ({ module: { ...item.module }, digest: item.digest }))
      .sort((left, right) => moduleKey(left.module).localeCompare(moduleKey(right.module))),
    instances: [...closure.instances].map((instance) => structuredClone(instance))
      .sort((left, right) => left.id.localeCompare(right.id)),
    scheduler: closure.scheduler,
    worker: closure.worker,
    stores: { ...closure.stores },
    endpoints: [...closure.endpoints].map((binding) => structuredClone(binding))
      .sort((left, right) => bindingKey(left).localeCompare(bindingKey(right))),
    scheduling: {
      maxConcurrency: closure.scheduling.maxConcurrency,
      lanes: [...closure.scheduling.lanes].map((lane) => ({ ...lane })).sort((left, right) => left.name.localeCompare(right.name)),
    },
  };
}

export function verifyRuntimeClosure(closure: RuntimeClosure): void {
  assert(closure.format === "svml.runtime-closure@1", "unsupported Runtime Closure format");
  assert(isDigest(closure.profile), "Runtime Closure profile digest is invalid");
  assert(isDigest(closure.digest) && closure.digest === digestOf(closureContent(closure)), "Runtime Closure digest differs");
  positiveInteger(closure.scheduling.maxConcurrency, "Runtime Closure maxConcurrency");
  const moduleKeys = closure.modules.map((item) => {
    assert(item.module.name.length > 0 && item.module.version.length > 0, "Runtime Closure module identity is invalid");
    assert(isDigest(item.digest), `${moduleKey(item.module)} Runtime Manifest digest is invalid`);
    return moduleKey(item.module);
  });
  assert(new Set(moduleKeys).size === moduleKeys.length, "Runtime Closure repeats a module");
  const laneNames = closure.scheduling.lanes.map((lane) => {
    assert(lane.name.trim().length > 0, "Runtime Closure lane is empty");
    positiveInteger(lane.maxConcurrency, `Runtime Closure lane ${lane.name}`);
    return lane.name;
  });
  assert(new Set(laneNames).size === laneNames.length, "Runtime Closure repeats a lane override");
  const instances = new Map<string, ResolvedRuntimeInstance>();
  for (const instance of closure.instances) {
    assert(!instances.has(instance.id), `Runtime Closure repeats instance ${instance.id}`);
    assert(isDigest(instance.implementation.digest), `${instance.id} implementation digest is invalid`);
    assert(isDigest(instance.configurationDigest), `${instance.id} configuration digest is invalid`);
    assert(moduleKeys.includes(moduleKey(instance.facet.module)), `${instance.id} refers to an unlocked Runtime module`);
    sortedUniqueStrings(instance.permissions, `${instance.id} permissions`);
    if (instance.role === "capability-endpoint") {
      assert(instance.lane.trim().length > 0, `${instance.id} Endpoint lane is empty`);
      positiveInteger(instance.maxConcurrency, `${instance.id} Endpoint maxConcurrency`);
      assert(instance.fulfills.length > 0, `${instance.id} Endpoint fulfills nothing`);
      assert(new Set(instance.fulfills.map(bindingKey)).size === instance.fulfills.length,
        `${instance.id} Endpoint repeats a capability`);
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
    journal: "runtime-journal",
    artifacts: "artifact-store",
  } as const;
  for (const [name, role] of Object.entries(roles) as [keyof typeof roles, typeof roles[keyof typeof roles]][]) {
    const id = closure.stores[name];
    assert(instances.get(id)?.role === role, `Runtime Closure ${name} store has the wrong role`);
  }
  for (const id of closure.stores.credentials) {
    assert(instances.get(id)?.role === "credential-store", `Runtime Closure credential store ${id} has the wrong role`);
  }
  for (const binding of closure.endpoints) {
    const endpoint = instances.get(binding.endpoint);
    assert(endpoint?.role === "capability-endpoint", `${binding.endpoint} is not a capability Endpoint`);
    assert(endpoint.fulfills.some((item) => sameCapability(item, binding)), `${binding.endpoint} does not fulfill ${bindingKey(binding)}`);
  }
  assert(new Set(closure.endpoints.map(bindingKey)).size === closure.endpoints.length,
    "Runtime Closure repeats an Endpoint binding");
  if (closure.instances.some((instance) => instance.role === "capability-endpoint" && instance.lifecycle === "recoverable")) {
    assert(instances.get(closure.stores.operations)?.role === "operation-store", "recoverable Endpoints require an OperationStore");
  }
  if (closure.instances.some((instance) => instance.role === "capability-endpoint" && instance.credentialSlots.length > 0)) {
    assert(closure.stores.credentials.length > 0, "credentialed Endpoints require a CredentialStore");
  }
}

export function resolveRuntimeProfile(
  registry: RuntimeModuleRegistry,
  profile: RuntimeProfile,
  options: ResolveRuntimeProfileOptions = {},
): RuntimeClosure {
  verifyRuntimeProfile(profile);
  const allowed = new Set(options.allowedPermissions ?? []);
  const modules = new Map<string, { readonly module: ModuleRef; readonly digest: Digest }>();
  const instances = profile.instances.map((instance): ResolvedRuntimeInstance => {
    const resolved = registry.resolve(instance.facet);
    assert(resolved !== undefined, `Runtime facet ${facetKey(instance.facet)} is not registered`);
    for (const permission of resolved.facet.permissions) {
      assert(allowed.has(permission), `${instance.id} requires disallowed Runtime permission ${permission}`);
    }
    modules.set(moduleKey(instance.facet.module), { module: { ...instance.facet.module }, digest: resolved.module.digest });
    const common = {
      id: instance.id,
      facet: { module: { ...instance.facet.module }, name: instance.facet.name },
      implementation: { ...resolved.facet.implementation },
      configurationDigest: instance.configurationDigest ?? digestOf({}),
      permissions: [...resolved.facet.permissions],
    };
    if (resolved.facet.role !== "capability-endpoint") return { ...common, role: resolved.facet.role };
    const lane = instance.lane ?? `endpoint:${instance.id}`;
    const override = profile.scheduling.lanes.find((candidate) => candidate.name === lane)?.maxConcurrency;
    return {
      ...common,
      role: "capability-endpoint",
      fulfills: resolved.facet.fulfills.map((item) => structuredClone(item)),
      lifecycle: resolved.facet.lifecycle,
      credentialSlots: [...(resolved.facet.credentialSlots ?? [])],
      lane,
      maxConcurrency: override ?? resolved.facet.defaultConcurrency,
    };
  });
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const schedulers = instances.filter((instance) => instance.role === "scheduler");
  assert(schedulers.length === 1, "Runtime Profile must activate exactly one scheduler instance");
  assert(schedulers[0]?.id === profile.scheduler, `Runtime Profile selects unknown scheduler ${profile.scheduler}`);
  const workers = instances.filter((instance) => instance.role === "worker");
  assert(workers.length === 1, "Runtime Profile must activate exactly one worker instance");
  assert(workers[0]?.id === profile.worker, `Runtime Profile selects unknown worker ${profile.worker}`);
  const storeRoles = {
    build: "build-store",
    operations: "operation-store",
    dispatch: "dispatch-store",
    journal: "runtime-journal",
    artifacts: "artifact-store",
  } as const;
  for (const [name, role] of Object.entries(storeRoles) as [keyof typeof storeRoles, typeof storeRoles[keyof typeof storeRoles]][]) {
    const id = profile.stores[name];
    assert(byId.get(id)?.role === role, `Runtime Profile ${name} store ${id} has the wrong role`);
  }
  for (const id of profile.stores.credentials) {
    assert(byId.get(id)?.role === "credential-store", `Runtime Profile credential store ${id} has the wrong role`);
  }
  for (const binding of profile.endpoints) {
    const endpoint = byId.get(binding.endpoint);
    assert(endpoint?.role === "capability-endpoint", `${binding.endpoint} is not an active capability Endpoint`);
    assert(endpoint.fulfills.some((item) => sameCapability(item, binding)), `${binding.endpoint} does not fulfill ${bindingKey(binding)}`);
  }
  if (instances.some((instance) => instance.role === "capability-endpoint" && instance.lifecycle === "recoverable")) {
    assert(byId.get(profile.stores.operations)?.role === "operation-store", "recoverable Endpoints require an OperationStore");
  }
  if (instances.some((instance) => instance.role === "capability-endpoint" && instance.credentialSlots.length > 0)) {
    assert(profile.stores.credentials.length > 0, "credentialed Endpoints require a CredentialStore");
  }
  const draft: RuntimeClosure = {
    format: "svml.runtime-closure@1",
    digest: digestOf("unsealed-runtime-closure"),
    profile: profile.digest,
    modules: [...modules.values()],
    instances,
    scheduler: profile.scheduler,
    worker: profile.worker,
    stores: { ...profile.stores },
    endpoints: profile.endpoints.map((binding) => structuredClone(binding)),
    scheduling: structuredClone(profile.scheduling),
  };
  const content = closureContent(draft);
  const closure = { ...content, digest: digestOf(content) };
  verifyRuntimeClosure(closure);
  return closure;
}

export function runtimeEndpoint(
  closure: RuntimeClosure,
  id: string,
): ResolvedRuntimeEndpoint | undefined {
  verifyRuntimeClosure(closure);
  const instance = closure.instances.find((candidate) => candidate.id === id);
  return instance?.role === "capability-endpoint" ? instance : undefined;
}

/** Fail before execution if the selected finite BuildPlan has an unbound external requirement. */
export function verifyRuntimeCoverage(closure: RuntimeClosure, state: BuildState): void {
  verifyRuntimeClosure(closure);
  const required = new Map<string, RuntimeCapability>();
  for (const step of state.plan.steps) {
    const producer = resolveProducer(state.program.closure, step.producer);
    for (const need of producer.needs) {
      const requirement = { capability: need.capability, returns: need.returns };
      required.set(bindingKey(requirement), requirement);
    }
  }
  for (const requirement of required.values()) {
    assert(
      closure.endpoints.some((binding) => sameCapability(binding, requirement)),
      `Runtime Closure does not bind demanded capability ${bindingKey(requirement)}`,
    );
  }
}

export function localSchedulerOptionsFromClosure(closure: RuntimeClosure): {
  readonly maxConcurrency: number;
  readonly laneLimits: Readonly<Record<string, number>>;
  readonly runtimeClosure: RuntimeClosure;
} {
  verifyRuntimeClosure(closure);
  return {
    maxConcurrency: closure.scheduling.maxConcurrency,
    laneLimits: Object.fromEntries(closure.scheduling.lanes.map((lane) => [lane.name, lane.maxConcurrency])),
    runtimeClosure: structuredClone(closure),
  };
}
