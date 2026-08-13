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

export const runtimeEndpointAdapterHostAbi = "svml.runtime-endpoint-adapter-host@1";
export const runtimeServiceAdapterHostAbi = "svml.runtime-service-adapter-host@1";

export type RuntimeAdapterKind = "endpoint" | "runtime-service";

function runtimeAdapterHostAbi(kind: RuntimeAdapterKind):
  | typeof runtimeEndpointAdapterHostAbi
  | typeof runtimeServiceAdapterHostAbi {
  return kind === "endpoint" ? runtimeEndpointAdapterHostAbi : runtimeServiceAdapterHostAbi;
}

type RuntimeAdapterAddress = {
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
  readonly abi: ReturnType<typeof runtimeAdapterHostAbi>;
  readonly identity?: never;
  readonly implementation: RuntimeEndpointAdapterImplementation | RuntimeServiceAdapterImplementation;
};

export type RuntimeAdapterPackageBinding = {
  /** Verified digest of the physical package and its complete dependency closure. */
  readonly closureDigest: Digest;
};

type RuntimeAdapterRegistration = {
  readonly implementation: RuntimeAdapterHostFacet["implementation"];
  readonly binding?: RuntimeAdapterPackageBinding;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function address(facet: RuntimeAdapterHostFacet): RuntimeAdapterAddress {
  const kind = facet.abi === runtimeEndpointAdapterHostAbi
    ? "endpoint"
    : facet.abi === runtimeServiceAdapterHostAbi ? "runtime-service" : undefined;
  assert(kind !== undefined, `Runtime Adapter ${facet.abi} ABI is unsupported`);
  assert(facet.offers?.length === 1 && facet.offers[0]!.trim().length > 0,
    "Runtime Adapter must offer exactly one non-empty use name");
  return { use: facet.offers[0]!, kind };
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
  assert(options.use.trim().length > 0, "Runtime Adapter use name is empty");
  const facet: RuntimeAdapterHostFacet = {
    abi: runtimeEndpointAdapterHostAbi,
    offers: [options.use],
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
  assert(options.use.trim().length > 0, "Runtime Adapter use name is empty");
  return {
    abi: runtimeServiceAdapterHostAbi,
    offers: [options.use],
    implementation: implementation({
      validate: options.validate,
      create: options.create,
      ...(options.doctor === undefined ? {} : { doctor: options.doctor }),
    }, `Runtime Adapter ${options.use}`, "runtime-service"),
  };
}

export function isRuntimeAdapterHostFacet(value: HostFacet): value is RuntimeAdapterHostFacet {
  try {
    assert(value.identity === undefined, "Runtime Adapter facet must not carry a second identity");
    const resolved = address(value as RuntimeAdapterHostFacet);
    implementation(value.implementation, "Runtime Adapter", resolved.kind);
    return true;
  } catch {
    return false;
  }
}

function boundImplementationDigest(
  binding: RuntimeAdapterPackageBinding,
  adapter: RuntimeAdapterAddress,
  facet: string,
  declared: Digest,
): Digest {
  assert(isDigest(binding.closureDigest), "Runtime Adapter package Closure digest is invalid");
  return digestOf({
    contract: "svml.loaded-runtime-implementation@1",
    closure: binding.closureDigest,
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
  adapter: RuntimeAdapterAddress,
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
  adapter: RuntimeAdapterAddress,
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

  #key(use: string, kind: RuntimeAdapterKind): string {
    return `${kind}\u0000${use}`;
  }

  #register(facet: RuntimeAdapterHostFacet, binding?: RuntimeAdapterPackageBinding): void {
    const resolved = address(facet);
    implementation(facet.implementation, `Runtime Adapter ${resolved.use}`, resolved.kind);
    const key = this.#key(resolved.use, resolved.kind);
    assert(!this.#registrations.has(key), `Runtime ${resolved.kind} Adapter ${resolved.use} is already registered`);
    if (binding !== undefined) {
      assert(isDigest(binding.closureDigest), "Runtime Adapter package Closure digest is invalid");
    }
    this.#registrations.set(key, {
      implementation: facet.implementation,
      ...(binding === undefined ? {} : { binding }),
    });
  }

  registerFacet(facet: HostFacet, binding?: RuntimeAdapterPackageBinding): void {
    assert(isRuntimeAdapterHostFacet(facet), `Host facet ${facet.abi} is not a valid Runtime Adapter`);
    this.#register(facet, binding);
  }

  has(use: string, kind?: RuntimeAdapterKind): boolean {
    return kind === undefined
      ? this.#registrations.has(this.#key(use, "endpoint")) || this.#registrations.has(this.#key(use, "runtime-service"))
      : this.#registrations.has(this.#key(use, kind));
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
    const value = this.#registrations.get(this.#key(use, kind));
    if (value === undefined) return [{
      severity: "error",
      code: "RUNTIME_ADAPTER_MISSING",
      message: `Runtime Adapter ${use} is not registered`,
      subject: use,
    }];
    assert(kind === "runtime-service", "Endpoint configuration is validated by its activation");
    (value.implementation as RuntimeServiceAdapterImplementation).validate(context);
    return [];
  }

  async activateEndpoint(
    use: string,
    context: RuntimeAdapterFactoryContext,
  ): Promise<RuntimeEndpointActivation> {
    const value = this.#registrations.get(this.#key(use, "endpoint"));
    assert(value !== undefined, `Runtime Endpoint adapter ${use} is not registered`);
    const implementation = value.implementation as RuntimeEndpointAdapterImplementation;
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
      endpoint: bindEndpointPackage(activation.endpoint, { use, kind: "endpoint" }, value.binding),
    };
  }

  async createEndpoint(use: string, context: RuntimeAdapterFactoryContext): Promise<EndpointPackage> {
    return (await this.activateEndpoint(use, context)).endpoint;
  }

  async createService(use: string, context: RuntimeAdapterFactoryContext): Promise<RuntimeServicePackage> {
    const value = this.#registrations.get(this.#key(use, "runtime-service"));
    assert(value !== undefined, `Runtime service adapter ${use} is not registered`);
    const implementation = value.implementation as RuntimeServiceAdapterImplementation;
    implementation.validate(context);
    const created = await implementation.create(context);
    for (const service of created.services) {
      assert(service.instance.id === context.instance || service.instance.id.startsWith(`${context.instance}.`),
        `Runtime Adapter ${use} created service ${service.instance.id} outside configured namespace ${context.instance}`);
    }
    return bindServicePackage(created, { use, kind: "runtime-service" }, value.binding);
  }

  async doctor(use: string, kind: RuntimeAdapterKind, context: RuntimeAdapterFactoryContext): Promise<readonly RuntimeDoctorDiagnostic[]> {
    const value = this.#registrations.get(this.#key(use, kind));
    if (value === undefined) return [{ severity: "error", code: "RUNTIME_ADAPTER_MISSING", message: `Runtime Adapter ${use} is not registered`, subject: use }];
    assert(kind === "runtime-service", "Endpoint diagnostics belong to its activation");
    const diagnose = (value.implementation as RuntimeServiceAdapterImplementation).doctor;
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
