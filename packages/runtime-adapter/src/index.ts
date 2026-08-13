import type {
  EndpointPackage,
  EndpointRegistrar,
  EndpointRegistrationOptions,
} from "@narratage/endpoint-kit";
import type { HostFacet } from "@narratage/host";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CanonicalValue, Digest } from "@narratage/protocol";
import type { RuntimeServicePackage } from "@narratage/runtime";
import { credentialRef } from "@narratage/runtime";
import type { CredentialRef } from "@narratage/runtime";

export const runtimeAdapterHostAbi = "svml.runtime-adapter-host@1";

export type RuntimeAdapterKind = "endpoint" | "runtime-service";

export type RuntimeAdapterIdentity = {
  readonly contract: "svml.runtime-adapter-facet@1";
  readonly use: string;
  readonly kind: RuntimeAdapterKind;
};

export type RuntimeAdapterFactoryContext = {
  /** Absolute project root resolved from the Runtime Profile document. */
  readonly root: string;
  readonly instance: string;
  /** Required for Endpoint adapters; absent for Runtime service adapters. */
  readonly authority?: string;
  readonly config: CanonicalValue;
  /** Observation commands may request adapters to avoid creating durable state. */
  readonly access?: "read-write" | "read-only";
};

export type RuntimeDoctorDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

/** One command this deployment may run on the developer's machine. */
export type RuntimeServiceCommand = {
  readonly command: string;
  readonly args: readonly string[];
};

export type RuntimeServiceState =
  | { readonly state: "ready" }
  | { readonly state: "down"; readonly detail: string }
  /** Something answers, but not as the configured deployment expects. */
  | { readonly state: "mismatch"; readonly detail: string };

/**
 * A separate program that must already be running for this Endpoint to work.
 *
 * An Endpoint that spawns a bounded process per Need declares nothing here; this
 * is for a program whose cost is its warm state, which therefore outlives one
 * Need and one Build. `start` is absent when the deployment does not own the
 * program's lifetime, as with a remote host, leaving `probe` to report on it.
 */
export type RuntimeExternalService = {
  readonly id: string;
  probe(): Promise<RuntimeServiceState>;
  readonly prepare?: RuntimeServiceCommand;
  readonly start?: RuntimeServiceCommand;
};

/**
 * The complete, side-effect-free declaration of one configured Endpoint.
 *
 * `activate` may parse configuration and construct handlers, but it must not
 * resolve credentials or environment-sourced deployment values, access the
 * network, start a process or mutate durable state. That gives normal execution, `doctor`, credential management and
 * service lifecycle one source of truth without making a second manifest just
 * for diagnostics.
 */
export type RuntimeEndpointActivation = {
  readonly endpoint: EndpointPackage;
  readonly externalService?: RuntimeExternalService;
  readonly diagnose?: () => readonly RuntimeDoctorDiagnostic[] | Promise<readonly RuntimeDoctorDiagnostic[]>;
};

export type RuntimeEndpointAdapterImplementation = {
  activate(context: RuntimeAdapterFactoryContext): RuntimeEndpointActivation | Promise<RuntimeEndpointActivation>;
};

export type RuntimeServiceAdapterImplementation = {
  /** Pure, closed-data validation. Must not construct a service or touch the environment. */
  validate(context: RuntimeAdapterFactoryContext): void;
  create(context: RuntimeAdapterFactoryContext): RuntimeServicePackage | Promise<RuntimeServicePackage>;
  doctor?(context: RuntimeAdapterFactoryContext): readonly RuntimeDoctorDiagnostic[] | Promise<readonly RuntimeDoctorDiagnostic[]>;
};

export type RuntimeAdapterHostFacet = HostFacet & {
  readonly abi: typeof runtimeAdapterHostAbi;
  readonly identity: RuntimeAdapterIdentity;
  readonly implementation: RuntimeEndpointAdapterImplementation | RuntimeServiceAdapterImplementation;
};

export type RuntimeAdapterPackageBinding = {
  readonly packageName: string;
  /** Actual digest of the selected physical package bytes. */
  readonly packageArtifactDigest: Digest;
  /** Actual digest of this physical package's transitive dependency closure. */
  readonly packageClosureDigest: Digest;
};

type RuntimeAdapterRegistration = {
  readonly facet: RuntimeAdapterHostFacet;
  readonly binding?: RuntimeAdapterPackageBinding;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: CanonicalValue): RuntimeAdapterIdentity {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Runtime Adapter identity must be an object");
  const item = value as unknown as RuntimeAdapterIdentity;
  assert(item.contract === "svml.runtime-adapter-facet@1", "Runtime Adapter identity contract is unsupported");
  assert(item.use.trim().length > 0, "Runtime Adapter use name is empty");
  assert(item.kind === "endpoint" || item.kind === "runtime-service", "Runtime Adapter kind is invalid");
  return canonicalize(item) as unknown as RuntimeAdapterIdentity;
}

function implementation(
  value: unknown,
  subject: string,
  kind: RuntimeAdapterKind,
): RuntimeAdapterHostFacet["implementation"] {
  assert(value !== null && typeof value === "object", `${subject} implementation is not an object`);
  if (kind === "endpoint") {
    assert(typeof (value as { activate?: unknown }).activate === "function",
      `${subject} does not implement activate()`);
    return value as RuntimeEndpointAdapterImplementation;
  }
  assert(typeof (value as { create?: unknown }).create === "function", `${subject} does not implement create()`);
  assert(typeof (value as { validate?: unknown }).validate === "function", `${subject} does not implement validate()`);
  const doctor = (value as { doctor?: unknown }).doctor;
  assert(doctor === undefined || typeof doctor === "function", `${subject}.doctor must be a function`);
  return value as RuntimeServiceAdapterImplementation;
}

export function createRuntimeEndpointAdapterFacet(options: {
  readonly use: string;
  readonly activate: RuntimeEndpointAdapterImplementation["activate"];
}): RuntimeAdapterHostFacet {
  const facet: RuntimeAdapterHostFacet = {
    abi: runtimeAdapterHostAbi,
    identity: identity(canonicalize({
      contract: "svml.runtime-adapter-facet@1",
      use: options.use,
      kind: "endpoint",
    })),
    implementation: implementation({ activate: options.activate }, `Runtime Adapter ${options.use}`, "endpoint"),
  };
  return facet;
}

export function createRuntimeServiceAdapterFacet(options: {
  readonly use: string;
  readonly validate: RuntimeServiceAdapterImplementation["validate"];
  readonly create: RuntimeServiceAdapterImplementation["create"];
  readonly doctor?: RuntimeServiceAdapterImplementation["doctor"];
}): RuntimeAdapterHostFacet {
  return {
    abi: runtimeAdapterHostAbi,
    identity: identity(canonicalize({
      contract: "svml.runtime-adapter-facet@1",
      use: options.use,
      kind: "runtime-service",
    })),
    implementation: implementation({
      validate: options.validate,
      create: options.create,
      ...(options.doctor === undefined ? {} : { doctor: options.doctor }),
    }, `Runtime Adapter ${options.use}`, "runtime-service"),
  };
}

export function isRuntimeAdapterHostFacet(value: HostFacet): value is RuntimeAdapterHostFacet {
  if (value.abi !== runtimeAdapterHostAbi) return false;
  try {
    identity(value.identity);
    implementation(value.implementation, "Runtime Adapter", identity(value.identity).kind);
    return true;
  } catch {
    return false;
  }
}

function boundImplementationDigest(
  binding: RuntimeAdapterPackageBinding,
  adapter: RuntimeAdapterIdentity,
  facet: string,
  declared: Digest,
): Digest {
  assert(isDigest(binding.packageArtifactDigest), `${binding.packageName} package Artifact digest is invalid`);
  assert(isDigest(binding.packageClosureDigest), `${binding.packageName} package Closure digest is invalid`);
  return digestOf({
    contract: "svml.loaded-runtime-implementation@1",
    package: binding.packageName,
    packageArtifact: binding.packageArtifactDigest,
    packageClosure: binding.packageClosureDigest,
    adapter,
    facet,
    declared,
  });
}

function proxyRegistrar(
  registry: EndpointRegistrar,
  digests: ReadonlyMap<string, Digest>,
): EndpointRegistrar {
  const options = (value: EndpointRegistrationOptions | undefined): EndpointRegistrationOptions | undefined => {
    const implementation = value?.runtimeImplementation;
    if (implementation === undefined) return value;
    const digest = digests.get(implementation.facet.name);
    assert(digest !== undefined, `Endpoint registration uses undeclared Runtime facet ${implementation.facet.name}`);
    return { ...value, runtimeImplementation: { ...implementation, digest } };
  };
  return {
    registerImmediateEndpoint(id, capability, returns, handler, value) {
      registry.registerImmediateEndpoint(id, capability, returns, handler, options(value));
    },
    registerRecoverableEndpoint(id, capability, returns, endpoint, value) {
      registry.registerRecoverableEndpoint(id, capability, returns, endpoint, options(value));
    },
  };
}

function bindEndpointPackage(
  value: EndpointPackage,
  adapter: RuntimeAdapterIdentity,
  binding: RuntimeAdapterPackageBinding | undefined,
): EndpointPackage {
  if (binding === undefined) return value;
  const digests = new Map(value.manifest.facets.map((facet) => [
    facet.name,
    boundImplementationDigest(binding, adapter, facet.name, facet.implementation.digest),
  ]));
  return {
    ...value,
    manifest: {
      ...value.manifest,
      facets: value.manifest.facets.map((facet) => ({
        ...facet,
        implementation: { ...facet.implementation, digest: digests.get(facet.name)! },
      })),
    },
    install(registry) {
      return value.install(proxyRegistrar(registry, digests));
    },
  };
}

function bindServicePackage(
  value: RuntimeServicePackage,
  adapter: RuntimeAdapterIdentity,
  binding: RuntimeAdapterPackageBinding | undefined,
): RuntimeServicePackage {
  if (binding === undefined) return value;
  return {
    ...value,
    manifest: {
      ...value.manifest,
      facets: value.manifest.facets.map((facet) => ({
        ...facet,
        implementation: {
          ...facet.implementation,
          digest: boundImplementationDigest(binding, adapter, facet.name, facet.implementation.digest),
        },
      })),
    },
  };
}

export class RuntimeAdapterRegistry {
  readonly #registrations = new Map<string, RuntimeAdapterRegistration>();

  #register(facet: RuntimeAdapterHostFacet, binding?: RuntimeAdapterPackageBinding): void {
    assert(facet.abi === runtimeAdapterHostAbi, `Runtime Adapter ${facet.abi} ABI is unsupported`);
    const normalized = identity(facet.identity);
    implementation(facet.implementation, `Runtime Adapter ${normalized.use}`, normalized.kind);
    assert(!this.#registrations.has(normalized.use), `Runtime Adapter ${normalized.use} is already registered`);
    if (binding !== undefined) {
      assert(binding.packageName.trim().length > 0, "Runtime Adapter physical package name is empty");
      assert(isDigest(binding.packageArtifactDigest), `${binding.packageName} package Artifact digest is invalid`);
      assert(isDigest(binding.packageClosureDigest), `${binding.packageName} package Closure digest is invalid`);
    }
    this.#registrations.set(normalized.use, {
      facet: { ...facet, identity: normalized },
      ...(binding === undefined ? {} : { binding }),
    });
  }

  registerFacet(facet: HostFacet, binding?: RuntimeAdapterPackageBinding): void {
    assert(isRuntimeAdapterHostFacet(facet), `Host facet ${facet.abi} is not a valid Runtime Adapter`);
    this.#register(facet, binding);
  }

  has(use: string, kind?: RuntimeAdapterKind): boolean {
    const value = this.#registrations.get(use);
    return value !== undefined && (kind === undefined || value.facet.identity.kind === kind);
  }

  /**
   * Validate one selected adapter without constructing it. Missing/kind errors
   * are diagnostics; adapter-owned configuration errors remain throws so the
   * Host can attach the selected instance and service/Endpoint-specific code.
   */
  validate(
    use: string,
    kind: RuntimeAdapterKind,
    context: RuntimeAdapterFactoryContext,
  ): readonly RuntimeDoctorDiagnostic[] {
    const value = this.#registrations.get(use);
    if (value === undefined) return [{
      severity: "error",
      code: "RUNTIME_ADAPTER_MISSING",
      message: `Runtime Adapter ${use} is not registered`,
      subject: use,
    }];
    if (value.facet.identity.kind !== kind) return [{
      severity: "error",
      code: "RUNTIME_ADAPTER_KIND",
      message: `Runtime Adapter ${use} is ${value.facet.identity.kind}, not ${kind}`,
      subject: use,
    }];
    assert(kind === "runtime-service", "Endpoint configuration is validated by its activation");
    (value.facet.implementation as RuntimeServiceAdapterImplementation).validate(context);
    return [];
  }

  async activateEndpoint(
    use: string,
    context: RuntimeAdapterFactoryContext,
  ): Promise<RuntimeEndpointActivation> {
    const value = this.#registrations.get(use);
    assert(value !== undefined, `Runtime Endpoint adapter ${use} is not registered`);
    assert(value.facet.identity.kind === "endpoint", `Runtime Adapter ${use} is not an Endpoint adapter`);
    const implementation = value.facet.implementation as RuntimeEndpointAdapterImplementation;
    const activation = await implementation.activate(context);
    assert(activation !== null && typeof activation === "object", `Runtime Endpoint adapter ${use} returned no activation`);
    assert(activation.endpoint !== null && typeof activation.endpoint === "object",
      `Runtime Endpoint adapter ${use} activation has no Endpoint package`);
    assert(activation.endpoint.instance.id === context.instance,
      `Runtime Endpoint adapter ${use} created Endpoint ${activation.endpoint.instance.id} outside configured instance ${context.instance}`);
    assert(activation.externalService === undefined || activation.externalService.id.trim().length > 0,
      `Runtime Endpoint adapter ${use} external service id is empty`);
    assert(activation.diagnose === undefined || typeof activation.diagnose === "function",
      `Runtime Endpoint adapter ${use} activation diagnose must be a function`);
    return {
      ...activation,
      endpoint: bindEndpointPackage(activation.endpoint, value.facet.identity, value.binding),
    };
  }

  async createEndpoint(use: string, context: RuntimeAdapterFactoryContext): Promise<EndpointPackage> {
    return (await this.activateEndpoint(use, context)).endpoint;
  }

  async createService(use: string, context: RuntimeAdapterFactoryContext): Promise<RuntimeServicePackage> {
    const value = this.#registrations.get(use);
    assert(value !== undefined, `Runtime service adapter ${use} is not registered`);
    assert(value.facet.identity.kind === "runtime-service", `Runtime Adapter ${use} is not a Runtime service adapter`);
    const implementation = value.facet.implementation as RuntimeServiceAdapterImplementation;
    implementation.validate(context);
    const created = await implementation.create(context);
    for (const service of created.services) {
      assert(service.instance.id === context.instance || service.instance.id.startsWith(`${context.instance}.`),
        `Runtime Adapter ${use} created service ${service.instance.id} outside configured namespace ${context.instance}`);
    }
    return bindServicePackage(created, value.facet.identity, value.binding);
  }

  async doctor(use: string, kind: RuntimeAdapterKind, context: RuntimeAdapterFactoryContext): Promise<readonly RuntimeDoctorDiagnostic[]> {
    const value = this.#registrations.get(use);
    if (value === undefined) return [{ severity: "error", code: "RUNTIME_ADAPTER_MISSING", message: `Runtime Adapter ${use} is not registered`, subject: use }];
    if (value.facet.identity.kind !== kind) return [{ severity: "error", code: "RUNTIME_ADAPTER_KIND", message: `Runtime Adapter ${use} is ${value.facet.identity.kind}, not ${kind}`, subject: use }];
    assert(kind === "runtime-service", "Endpoint diagnostics belong to its activation");
    const diagnose = (value.facet.implementation as RuntimeServiceAdapterImplementation).doctor;
    return diagnose === undefined ? [] : await diagnose(context);
  }
}

export function runtimeConfigObject(value: CanonicalValue, subject: string): Record<string, CanonicalValue> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} config must be an object`);
  return value as Record<string, CanonicalValue>;
}

export function runtimeConfigExact(value: Record<string, CanonicalValue>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  assert(unknown.length === 0, `${subject} config does not accept ${unknown[0]}`);
}

export function runtimeConfigString(value: CanonicalValue | undefined, subject: string): string | undefined {
  if (value === undefined) return undefined;
  assert(typeof value === "string" && value.trim().length > 0, `${subject} must be a non-empty string`);
  return value;
}

export function runtimeConfigPositiveInteger(value: CanonicalValue | undefined, subject: string): number | undefined {
  if (value === undefined) return undefined;
  assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

export function runtimeConfigBoolean(value: CanonicalValue | undefined, subject: string): boolean | undefined {
  if (value === undefined) return undefined;
  assert(typeof value === "boolean", `${subject} must be a boolean`);
  return value;
}

/** Closed deployment syntax for a CredentialRef; secret bytes never enter the Profile. */
export function runtimeConfigCredentialRef(
  value: CanonicalValue | undefined,
  subject: string,
): CredentialRef | undefined {
  if (value === undefined) return undefined;
  const object = runtimeConfigObject(value, subject);
  runtimeConfigExact(object, ["store", "key"], subject);
  const store = runtimeConfigString(object.store, `${subject}.store`);
  const key = runtimeConfigString(object.key, `${subject}.key`);
  assert(store !== undefined && key !== undefined, `${subject} requires store and key`);
  return credentialRef(store, key);
}
