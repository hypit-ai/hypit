import type {
  CanonicalValue,
  CapabilityRef,
  FulfillNeedCommand,
  ModuleRef,
  Need,
  StoredValue,
  TypeRef,
} from "@narratage/protocol";
import type {
  ArtifactStore,
  CredentialRef,
  CredentialValue,
  OperationFailure,
  OperationIdentity,
  OperationProgress,
  EndpointOffer,
  RuntimeFacetRef,
  RuntimeModuleManifest,
  RuntimeFacetInstance,
} from "@narratage/runtime";
import { verifyCredentialRef } from "@narratage/runtime";

export type Awaitable<T> = T | Promise<T>;

export type EndpointFulfillment = {
  readonly value: StoredValue;
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
  | {
      readonly status: "pending";
      readonly checkpoint: CanonicalValue;
      readonly wakeAt?: number;
      readonly progress?: OperationProgress;
    }
  | { readonly status: "completed"; readonly result: EndpointFulfillment }
  | { readonly status: "failed"; readonly failure: OperationFailure };

export type EndpointStartContext = EndpointInvocationContext & {
  readonly operation: OperationIdentity;
};

export type EndpointResumeContext = EndpointStartContext & {
  /** Undefined means the process stopped after intent was persisted but before a checkpoint existed. */
  readonly checkpoint: CanonicalValue | undefined;
};

/**
 * Provider-side acknowledgement is deliberately separate from the Operation's final state.
 * `accepted` means the remote system accepted a request but may still finish normally; only
 * `confirmed` proves that the work itself is cancelled.
 */
export type EndpointCancelOutcome =
  | { readonly status: "confirmed" }
  | { readonly status: "accepted"; readonly wakeAt?: number }
  | { readonly status: "unsupported" }
  | { readonly status: "too-late" };

export type RecoverableEndpoint = {
  start(context: EndpointStartContext): Awaitable<EndpointOutcome>;
  resume(context: EndpointResumeContext): Awaitable<EndpointOutcome>;
  cancel?(context: EndpointResumeContext): Awaitable<EndpointCancelOutcome>;
};

/** Endpoint/implementation scheduling metadata; it never changes Core demand or command identity. */
export type EndpointScheduling = {
  readonly resources: readonly {
    readonly id: string;
    readonly maxActive: number;
    readonly maxInFlight: number;
  }[];
  readonly queue?: {
    readonly pool: string;
    readonly lane: string;
  };
};

export type EndpointRetryPolicy = {
  /** Includes the first submission. A new attempt receives a new Operation id. */
  readonly maxAttempts: number;
};

export type EndpointRegistrationOptions = {
  readonly supports?: (need: Need) => boolean;
  readonly scheduling?: EndpointScheduling;
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
  readonly manifest: RuntimeModuleManifest;
  readonly instance: RuntimeFacetInstance;
  readonly offers: readonly EndpointOffer[];
  /** Host-facing login material declared by this exact configured Endpoint instance. */
  readonly credentials: readonly EndpointCredentialDescription[];
  install(registry: EndpointRegistrar): Awaitable<void>;
};

export type EndpointCredentialDescription = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly kind: "secret" | "json";
  readonly ref: CredentialRef;
};

type EndpointCapabilityBase = {
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly supports?: (need: Need) => boolean;
  /** Stable Provider-local queue lane. Defaults to the capability name. */
  readonly lane?: string;
  /** Lane capacity; the Provider pool keeps its independent total capacity. */
  readonly maxConcurrency?: number;
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
  /** Explicit non-secret account, deployment or compute-pool identity. */
  readonly pool: string;
  readonly credentials?: Readonly<Record<string, CredentialRef>>;
  readonly credentialInputs?: Readonly<Record<string, {
    readonly label: string;
    readonly kind?: "secret" | "json";
  }>>;
  /** Total capacity shared by every lane under this configured Provider pool. */
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
  assert(options.pool.trim().length > 0, "Endpoint Provider Pool is empty");
  assert(options.capabilities.length > 0, "Endpoint package declares no capability");
  const lifecycle = options.capabilities[0]!.lifecycle;
  assert(options.capabilities.every((item) => item.lifecycle === lifecycle),
    "one Endpoint facet cannot mix immediate and recoverable lifecycles");
  const keys = options.capabilities.map((item) => refKey(item.capability));
  assert(new Set(keys).size === keys.length, "Endpoint package repeats a capability");
  const lanes = options.capabilities.map((item) => item.lane ?? item.capability.name);
  assert(lanes.every((lane) => lane.trim().length > 0), "Endpoint package lane is empty");
  const laneConcurrency = new Map<string, number>();
  for (const capability of options.capabilities) {
    const lane = capability.lane ?? capability.capability.name;
    const concurrency = positiveInteger(
      capability.maxConcurrency ?? options.defaultConcurrency ?? 1,
      `${capability.capability.name} maxConcurrency`,
    );
    const previous = laneConcurrency.get(lane);
    assert(previous === undefined || previous === concurrency,
      `Endpoint package lane ${lane} has conflicting concurrency limits`);
    laneConcurrency.set(lane, concurrency);
  }
  const credentials = Object.fromEntries(Object.entries(options.credentials ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slot, ref]) => {
      assert(slot.trim().length > 0, "Endpoint credential slot is empty");
      verifyCredentialRef(ref);
      return [slot, structuredClone(ref)];
    }));
  const credentialInputs = options.credentialInputs ?? {};
  for (const slot of Object.keys(credentialInputs)) {
    assert(slot in credentials, `Endpoint credential input ${slot} has no configured CredentialRef`);
  }
  const credentialDescriptions = Object.entries(credentials).map(([slot, ref]) => {
    const input = credentialInputs[slot];
    const label = input?.label ?? slot;
    assert(label.trim().length > 0, `Endpoint credential ${slot} label is empty`);
    const kind = input?.kind ?? "secret";
    assert(kind === "secret" || kind === "json", `Endpoint credential ${slot} kind is invalid`);
    return {
      endpoint: options.instance,
      slot,
      label,
      kind,
      ref: structuredClone(ref),
    } satisfies EndpointCredentialDescription;
  });
  const module = { ...options.module };
  const facet = { module, name: options.facet };
  const fulfills = options.capabilities.map((item) => ({
    capability: structuredClone(item.capability),
    returns: structuredClone(item.returns),
  }));
  const manifest: RuntimeModuleManifest = {
    format: "narratage.runtime-module@1",
    name: module.name,
    version: module.version,
    facets: [{
      name: options.facet,
      role: "capability-endpoint",
      fulfills,
      lifecycle,
      defaultConcurrency: positiveInteger(options.defaultConcurrency ?? 1, "defaultConcurrency"),
      lanes: options.capabilities.map((capability) => ({
        capability: structuredClone(capability.capability),
        returns: structuredClone(capability.returns),
        lane: capability.lane ?? capability.capability.name,
        maxConcurrency: positiveInteger(
          capability.maxConcurrency ?? options.defaultConcurrency ?? 1,
          `${capability.capability.name} maxConcurrency`,
        ),
      })),
      credentialSlots: Object.keys(credentials),
    }],
  };
  const instance: RuntimeFacetInstance = {
    id: options.instance,
    facet,
    pool: options.pool,
  };
  const offers: readonly EndpointOffer[] = fulfills.map((item) => ({
    ...item,
    endpoint: options.instance,
  }));
  return {
    manifest,
    instance,
    offers,
    credentials: credentialDescriptions,
    install(registry) {
      for (const capability of options.capabilities) {
        const lane = capability.lane ?? capability.capability.name;
        const authorityConcurrency = positiveInteger(options.defaultConcurrency ?? 1, "defaultConcurrency");
        const laneConcurrency = positiveInteger(
          capability.maxConcurrency ?? authorityConcurrency,
          `${lane} maxConcurrency`,
        );
        const common: EndpointRegistrationOptions = {
          ...(capability.supports === undefined ? {} : { supports: capability.supports }),
          credentials,
          scheduling: {
            queue: { pool: options.pool, lane },
            resources: [
              {
                id: `pool:${options.pool}`,
                maxActive: authorityConcurrency,
                maxInFlight: authorityConcurrency,
              },
              {
                id: `lane:${options.pool}/${lane}`,
                maxActive: laneConcurrency,
                maxInFlight: laneConcurrency,
              },
            ],
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
  progress?: OperationProgress,
): {
  readonly status: "pending";
  readonly checkpoint: CanonicalValue;
  readonly wakeAt: number;
  readonly progress?: OperationProgress;
} {
  assert(Number.isSafeInteger(delayMs) && delayMs >= 0, "wake delay must be a non-negative safe integer");
  assert(Number.isSafeInteger(now) && now >= 0, "current time must be a non-negative epoch millisecond");
  return {
    status: "pending",
    checkpoint,
    wakeAt: now + delayMs,
    ...(progress === undefined ? {} : { progress }),
  };
}
