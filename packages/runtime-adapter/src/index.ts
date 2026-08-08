import type {
  EndpointPackage,
  EndpointRegistrar,
  EndpointRegistrationOptions,
} from "@narratage/endpoint-kit";
import type { HostFacet } from "@narratage/host";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CanonicalValue, Digest } from "@narratage/protocol";
import type { RuntimeServicePackage } from "@narratage/runtime";

export const runtimeAdapterHostAbi = "svml.runtime-adapter-host@2";

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
  readonly lane?: string;
  readonly config: CanonicalValue;
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

export type RuntimeEndpointAdapterImplementation = {
  /** Pure, closed-data validation. Must not construct an Endpoint or touch the environment. */
  validate(context: RuntimeAdapterFactoryContext): void;
  create(context: RuntimeAdapterFactoryContext): EndpointPackage | Promise<EndpointPackage>;
  doctor?(context: RuntimeAdapterFactoryContext): readonly RuntimeDoctorDiagnostic[] | Promise<readonly RuntimeDoctorDiagnostic[]>;
  service?(context: RuntimeAdapterFactoryContext): RuntimeExternalService | undefined;
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

function implementation(value: unknown, subject: string): RuntimeAdapterHostFacet["implementation"] {
  assert(value !== null && typeof value === "object" && typeof (value as { create?: unknown }).create === "function",
    `${subject} does not implement create()`);
  assert(typeof (value as { validate?: unknown }).validate === "function",
    `${subject} does not implement validate()`);
  const doctor = (value as { doctor?: unknown }).doctor;
  assert(doctor === undefined || typeof doctor === "function", `${subject}.doctor must be a function`);
  return value as RuntimeAdapterHostFacet["implementation"];
}

export function createRuntimeEndpointAdapterFacet(options: {
  readonly use: string;
  readonly validate: RuntimeEndpointAdapterImplementation["validate"];
  readonly create: RuntimeEndpointAdapterImplementation["create"];
  readonly doctor?: RuntimeEndpointAdapterImplementation["doctor"];
  readonly service?: RuntimeEndpointAdapterImplementation["service"];
}): RuntimeAdapterHostFacet {
  const facet: RuntimeAdapterHostFacet = {
    abi: runtimeAdapterHostAbi,
    identity: identity(canonicalize({
      contract: "svml.runtime-adapter-facet@1",
      use: options.use,
      kind: "endpoint",
    })),
    // Validated here, not only at the loading boundary. A facet that fails
    // isRuntimeAdapterHostFacet is skipped by the loader, so the author of a
    // broken adapter would otherwise learn about it as "adapter X is not
    // registered", three layers from the mistake.
    implementation: implementation({
      validate: options.validate,
      create: options.create,
      ...(options.doctor === undefined ? {} : { doctor: options.doctor }),
      ...(options.service === undefined ? {} : { service: options.service }),
    }, `Runtime Adapter ${options.use}`),
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
    }, `Runtime Adapter ${options.use}`),
  };
}

export function isRuntimeAdapterHostFacet(value: HostFacet): value is RuntimeAdapterHostFacet {
  if (value.abi !== runtimeAdapterHostAbi) return false;
  try {
    identity(value.identity);
    implementation(value.implementation, "Runtime Adapter");
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
    implementation(facet.implementation, `Runtime Adapter ${normalized.use}`);
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

  /** Trusted embedding compatibility. Locked installed packages should use registerFacet(). */
  registerEndpoint(use: string, create: RuntimeEndpointAdapterImplementation["create"]): void {
    this.#register(createRuntimeEndpointAdapterFacet({ use, validate() {}, create }));
  }

  /** Trusted embedding compatibility. Locked installed packages should use registerFacet(). */
  registerService(use: string, create: RuntimeServiceAdapterImplementation["create"]): void {
    this.#register(createRuntimeServiceAdapterFacet({ use, validate() {}, create }));
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
    value.facet.implementation.validate(context);
    return [];
  }

  async createEndpoint(use: string, context: RuntimeAdapterFactoryContext): Promise<EndpointPackage> {
    const value = this.#registrations.get(use);
    assert(value !== undefined, `Runtime Endpoint adapter ${use} is not registered`);
    assert(value.facet.identity.kind === "endpoint", `Runtime Adapter ${use} is not an Endpoint adapter`);
    const implementation = value.facet.implementation as RuntimeEndpointAdapterImplementation;
    implementation.validate(context);
    const created = await implementation.create(context);
    return bindEndpointPackage(created, value.facet.identity, value.binding);
  }

  async createService(use: string, context: RuntimeAdapterFactoryContext): Promise<RuntimeServicePackage> {
    const value = this.#registrations.get(use);
    assert(value !== undefined, `Runtime service adapter ${use} is not registered`);
    assert(value.facet.identity.kind === "runtime-service", `Runtime Adapter ${use} is not a Runtime service adapter`);
    const implementation = value.facet.implementation as RuntimeServiceAdapterImplementation;
    implementation.validate(context);
    const created = await implementation.create(context);
    return bindServicePackage(created, value.facet.identity, value.binding);
  }

  /** The external program this Endpoint adapter needs running, when it declares one. */
  service(use: string, context: RuntimeAdapterFactoryContext): RuntimeExternalService | undefined {
    const value = this.#registrations.get(use);
    if (value === undefined || value.facet.identity.kind !== "endpoint") return undefined;
    const implementation = value.facet.implementation as RuntimeEndpointAdapterImplementation;
    implementation.validate(context);
    const declare = implementation.service;
    return declare === undefined ? undefined : declare(context);
  }

  async doctor(use: string, kind: RuntimeAdapterKind, context: RuntimeAdapterFactoryContext): Promise<readonly RuntimeDoctorDiagnostic[]> {
    const value = this.#registrations.get(use);
    if (value === undefined) return [{ severity: "error", code: "RUNTIME_ADAPTER_MISSING", message: `Runtime Adapter ${use} is not registered`, subject: use }];
    if (value.facet.identity.kind !== kind) return [{ severity: "error", code: "RUNTIME_ADAPTER_KIND", message: `Runtime Adapter ${use} is ${value.facet.identity.kind}, not ${kind}`, subject: use }];
    const diagnose = (value.facet.implementation as RuntimeEndpointAdapterImplementation).doctor;
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
