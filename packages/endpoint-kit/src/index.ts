import {
  canonicalize,
  digestOf,
  isDigest,
} from "@svml/protocol";
import type {
  CanonicalValue,
  CapabilityRef,
  Conformance,
  Delivery,
  Digest,
  FulfillNeedCommand,
  ModuleRef,
  Need,
  StoredValue,
  TypeRef,
} from "@svml/protocol";
import type {
  ArtifactStore,
  CredentialRef,
  CredentialValue,
  OperationFailure,
  OperationIdentity,
  RuntimeEndpointBinding,
  RuntimeFacetRef,
  RuntimeModuleManifest,
  RuntimeProfileInstance,
} from "@svml/runtime";
import { verifyCredentialRef } from "@svml/runtime";

export type Awaitable<T> = T | Promise<T>;

export type EndpointFulfillment = {
  readonly value: StoredValue;
  readonly conformance: Conformance;
  readonly delivery: Delivery;
  readonly metadata: CanonicalValue;
};

export type EndpointInvocationContext = {
  readonly command: FulfillNeedCommand;
  readonly need: Need;
  readonly artifacts: ArtifactStore;
  /** Only slots explicitly declared by this configured Endpoint instance are present. */
  readonly credentials: Readonly<Record<string, CredentialValue>>;
};

export type ImmediateEndpointHandler = (
  context: EndpointInvocationContext,
) => Awaitable<EndpointFulfillment>;

export type EndpointOutcome =
  | { readonly status: "pending"; readonly checkpoint: CanonicalValue; readonly wakeAt?: number }
  | { readonly status: "completed"; readonly result: EndpointFulfillment }
  | { readonly status: "failed"; readonly failure: OperationFailure };

export type EndpointStartContext = EndpointInvocationContext & {
  readonly operation: OperationIdentity;
};

export type EndpointResumeContext = EndpointStartContext & {
  /** Undefined means the process stopped after intent was journaled but before a checkpoint existed. */
  readonly checkpoint: CanonicalValue | undefined;
};

export type RecoverableEndpoint = {
  start(context: EndpointStartContext): Awaitable<EndpointOutcome>;
  resume(context: EndpointResumeContext): Awaitable<EndpointOutcome>;
  cancel?(context: EndpointResumeContext): Awaitable<void>;
};

/** Endpoint/implementation scheduling metadata; it never changes Core demand or command identity. */
export type EndpointScheduling = {
  readonly lane?: string;
  readonly maxConcurrency?: number;
};

export type EndpointRetryPolicy = {
  /** Includes the first submission. A new attempt receives a new submission key. */
  readonly maxAttempts: number;
};

export type RuntimeEndpointImplementation = {
  readonly facet: RuntimeFacetRef;
  readonly digest: Digest;
  /** Identity of the configured endpoint instance; secret values are never part of it. */
  readonly configurationDigest: Digest;
};

export type EndpointRegistrationOptions = {
  readonly supports?: (need: Need) => boolean;
  readonly scheduling?: EndpointScheduling;
  readonly runtimeImplementation?: RuntimeEndpointImplementation;
  readonly credentials?: Readonly<Record<string, CredentialRef>>;
  readonly retry?: EndpointRetryPolicy;
};

/** Minimal structural port implemented by a trusted execution Host. */
export interface EndpointRegistrar {
  registerImmediateEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    handler: ImmediateEndpointHandler,
    options?: EndpointRegistrationOptions,
  ): void;
  registerRecoverableEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    endpoint: RecoverableEndpoint,
    options?: EndpointRegistrationOptions,
  ): void;
}

export type EndpointPackage = {
  readonly name: string;
  readonly manifest: RuntimeModuleManifest;
  readonly instance: RuntimeProfileInstance;
  readonly bindings: readonly RuntimeEndpointBinding[];
  install(registry: EndpointRegistrar): Awaitable<void>;
};

type EndpointCapabilityBase = {
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly supports?: (need: Need) => boolean;
};

export type ImmediateEndpointCapability = EndpointCapabilityBase & {
  readonly lifecycle: "immediate";
  readonly handler: ImmediateEndpointHandler;
};

export type RecoverableEndpointCapability = EndpointCapabilityBase & {
  readonly lifecycle: "recoverable";
  readonly endpoint: RecoverableEndpoint;
  readonly retry?: EndpointRetryPolicy;
};

export type EndpointCapability = ImmediateEndpointCapability | RecoverableEndpointCapability;

export type DefineEndpointPackageOptions = {
  readonly module: ModuleRef;
  readonly facet: string;
  readonly instance: string;
  readonly lane?: string;
  readonly implementation: {
    readonly locator: string;
    readonly digest: Digest;
  };
  readonly permissions?: readonly string[];
  /** Non-secret deployment facts such as base URL, region and credential references. */
  readonly configuration?: CanonicalValue;
  readonly credentials?: Readonly<Record<string, CredentialRef>>;
  readonly defaultConcurrency?: number;
  readonly capabilities: readonly EndpointCapability[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function refKey(ref: { readonly module: ModuleRef; readonly name: string }): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

/** Build every static and executable fact for one configured Endpoint from one definition. */
export function defineEndpointPackage(options: DefineEndpointPackageOptions): EndpointPackage {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Endpoint module identity is invalid");
  assert(options.facet.trim().length > 0, "Endpoint facet is empty");
  assert(options.instance.trim().length > 0, "Endpoint instance is empty");
  if (options.lane !== undefined) assert(options.lane.trim().length > 0, "Endpoint lane is empty");
  assert(options.implementation.locator.trim().length > 0, "Endpoint implementation locator is empty");
  assert(isDigest(options.implementation.digest), "Endpoint implementation digest is invalid");
  assert(options.capabilities.length > 0, "Endpoint package declares no capability");
  const lifecycle = options.capabilities[0]!.lifecycle;
  assert(options.capabilities.every((item) => item.lifecycle === lifecycle),
    "one Endpoint facet cannot mix immediate and recoverable lifecycles");
  const keys = options.capabilities.map((item) => refKey(item.capability));
  assert(new Set(keys).size === keys.length, "Endpoint package repeats a capability");
  const permissions = [...(options.permissions ?? [])].sort();
  assert(new Set(permissions).size === permissions.length, "Endpoint package repeats a permission");
  const credentials = Object.fromEntries(Object.entries(options.credentials ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slot, ref]) => {
      assert(slot.trim().length > 0, "Endpoint credential slot is empty");
      verifyCredentialRef(ref);
      return [slot, structuredClone(ref)];
    }));
  const configuration = canonicalize(options.configuration ?? null);
  const executionPolicy = options.capabilities.map((capability) => ({
    capability: refKey(capability.capability),
    lifecycle: capability.lifecycle,
    ...(capability.lifecycle === "recoverable" && capability.retry !== undefined
      ? { retry: { maxAttempts: capability.retry.maxAttempts } }
      : {}),
  })).sort((left, right) => left.capability.localeCompare(right.capability));
  const configurationDigest = digestOf({ configuration, credentials, executionPolicy });
  const module = { ...options.module };
  const facet = { module, name: options.facet };
  const fulfills = options.capabilities.map((item) => ({
    capability: structuredClone(item.capability),
    returns: structuredClone(item.returns),
  }));
  const manifest: RuntimeModuleManifest = {
    format: "svml.runtime-module@2",
    name: module.name,
    version: module.version,
    facets: [{
      name: options.facet,
      role: "capability-endpoint",
      implementation: { ...options.implementation },
      permissions,
      fulfills,
      lifecycle,
      defaultConcurrency: positiveInteger(options.defaultConcurrency ?? 1, "defaultConcurrency"),
      credentialSlots: Object.keys(credentials),
    }],
  };
  const instance: RuntimeProfileInstance = {
    id: options.instance,
    facet,
    configurationDigest,
    ...(options.lane === undefined ? {} : { lane: options.lane }),
  };
  const bindings: readonly RuntimeEndpointBinding[] = fulfills.map((item) => ({
    ...item,
    endpoint: options.instance,
  }));
  return {
    name: options.instance,
    manifest,
    instance,
    bindings,
    install(registry) {
      for (const capability of options.capabilities) {
        const common: EndpointRegistrationOptions = {
          ...(capability.supports === undefined ? {} : { supports: capability.supports }),
          runtimeImplementation: {
            facet,
            digest: options.implementation.digest,
            configurationDigest,
          },
          credentials,
          scheduling: {
            lane: options.lane ?? `endpoint:${options.instance}`,
            maxConcurrency: options.defaultConcurrency ?? 1,
          },
          ...(capability.lifecycle === "recoverable" && capability.retry !== undefined
            ? { retry: capability.retry }
            : {}),
        };
        if (capability.lifecycle === "immediate") {
          registry.registerImmediateEndpoint(
            options.instance,
            capability.capability,
            capability.returns,
            capability.handler,
            common,
          );
        } else {
          registry.registerRecoverableEndpoint(
            options.instance,
            capability.capability,
            capability.returns,
            capability.endpoint,
            common,
          );
        }
      }
    },
  };
}

export function wakeAfter(
  checkpoint: CanonicalValue,
  delayMs: number,
  now = Date.now(),
): { readonly status: "pending"; readonly checkpoint: CanonicalValue; readonly wakeAt: number } {
  assert(Number.isSafeInteger(delayMs) && delayMs >= 0, "wake delay must be a non-negative safe integer");
  assert(Number.isSafeInteger(now) && now >= 0, "current time must be a non-negative epoch millisecond");
  return { status: "pending", checkpoint, wakeAt: now + delayMs };
}
