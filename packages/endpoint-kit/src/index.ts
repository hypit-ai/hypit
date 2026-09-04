import type {
  CanonicalValue,
  CapabilityRef,
  FulfillNeedCommand,
  ModuleRef,
  Need,
  StoredValue,
  TypeRef,
} from "@hypit/protocol";
import type {
  ResourceStore,
  CredentialAcquisition,
  CredentialRef,
  CredentialValue,
  OperationFailure,
  OperationProgress,
} from "@hypit/runtime";
import { verifyCredentialRef } from "@hypit/runtime";

export type Awaitable<T> = T | Promise<T>;

export type EndpointFulfillment = {
  readonly value: StoredValue;
};

/** One future input binding whose value does not exist until an upstream graph step runs. */
export type EndpointInputSlot = {
  readonly input: string;
  readonly role?: string;
};

/**
 * The complete support-relevant request. Execution-only ids and the result Record are deliberately
 * absent. Before a Build, future graph values appear as semantic slots; during execution their
 * concrete values are already present in `constraints` and `pendingInputs` is omitted.
 */
export type EndpointRequest = {
  readonly capability: Need["capability"];
  readonly returns: Need["returns"];
  readonly constraints: Need["constraints"];
  readonly pendingInputs?: readonly EndpointInputSlot[];
};

export type EndpointInvocationContext = {
  readonly command: FulfillNeedCommand;
  readonly need: Need;
  readonly resources: ResourceStore;
  /** Only slots explicitly declared by this configured Endpoint instance are present. */
  readonly credentials: Readonly<Record<string, CredentialValue>>;
};

export type ImmediateEndpointHandler = (
  context: EndpointInvocationContext,
) => Awaitable<EndpointFulfillment>;

export type EndpointOutcome =
  | {
      readonly status: "pending";
      readonly handle: CanonicalValue;
      readonly wakeAt?: number;
      readonly progress?: OperationProgress;
    }
  | { readonly status: "completed"; readonly result: EndpointFulfillment }
  | { readonly status: "failed"; readonly failure: OperationFailure };

export type EndpointStartContext = EndpointInvocationContext & {
  /** Runtime-local identifier used to poll or cancel this submission. */
  readonly operation: string;
};

export type EndpointPollContext = EndpointStartContext & {
  /** Provider task state returned by start(). */
  readonly handle: CanonicalValue;
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

export type AsyncEndpoint = {
  start(context: EndpointStartContext): Awaitable<EndpointOutcome>;
  poll(context: EndpointPollContext): Awaitable<EndpointOutcome>;
  cancel?(context: EndpointPollContext): Awaitable<EndpointCancelOutcome>;
};

/** Endpoint scheduling. It never changes Core demand. */
export type EndpointScheduling = {
  readonly resources: readonly {
    readonly id: string;
    /** Maximum Commands occupying this active Provider resource across Builds. */
    readonly limit: number;
  }[];
};

export type EndpointRegistrationOptions = {
  readonly supports?: (request: EndpointRequest) => boolean;
  readonly scheduling?: EndpointScheduling;
  readonly credentials?: Readonly<Record<string, CredentialRef>>;
  /**
   * This immediate capability may be evaluated by a disposable authoring session without a
   * Build, Result or recoverable Operation. The Provider is asserting that doing so submits no
   * paid generation and creates no externally visible side effect. It is not a byte-for-byte
   * reproducibility claim.
   */
  readonly transient?: true;
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
  registerAsyncEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    endpoint: AsyncEndpoint,
    options?: EndpointRegistrationOptions,
  ): void;
}

/**
 * Where the Provider behind an Endpoint publishes its prices. Hypit never copies or interprets the
 * prices themselves; it only tells the caller where the Provider's own page is, or that the work runs
 * on this machine without a Provider charge.
 */
export type EndpointPricing =
  | { readonly kind: "page"; readonly url: string }
  | { readonly kind: "local" };

export type EndpointPackage = {
  readonly instance: {
    readonly id: string;
    readonly pool: string;
  };
  readonly offers: readonly EndpointOffer[];
  /** Host-facing login material declared by this exact configured Endpoint instance. */
  readonly credentials: readonly EndpointCredentialDescription[];
  readonly pricing?: EndpointPricing;
  install(registry: EndpointRegistrar): Awaitable<void>;
};

export type EndpointOffer = {
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly endpoint: string;
  readonly supports?: (request: EndpointRequest) => boolean;
  readonly transient?: true;
};

export type EndpointCredentialDescription = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly kind: "secret" | "json";
  readonly ref: CredentialRef;
  readonly acquisition?: CredentialAcquisition;
};

type EndpointCapabilityBase = {
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly supports?: (request: EndpointRequest) => boolean;
  /**
   * Also allow this capability in a disposable, non-Build authoring execution.
   * The Provider is asserting that it needs no durable or cross-Build capacity
   * admission; declared limits are still honored within that one session.
   */
  readonly transient?: true;
  /** Stable Provider-local capacity class. Defaults to the capability name. */
  readonly capacity?: string;
  /** Exact-capability capacity; the Provider pool keeps its independent total capacity. */
  readonly maxConcurrency?: number;
};

export type ImmediateEndpointCapability = EndpointCapabilityBase & {
  readonly lifecycle: "immediate";
  readonly handler: ImmediateEndpointHandler;
};

export type AsyncEndpointCapability = EndpointCapabilityBase & {
  readonly lifecycle: "asynchronous";
  readonly endpoint: AsyncEndpoint;
};

export type EndpointCapability = ImmediateEndpointCapability | AsyncEndpointCapability;

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
    readonly acquisition?: CredentialAcquisition;
  }>>;
  /** Total capacity shared by every capability under this configured Provider pool. */
  readonly defaultConcurrency?: number;
  /** The Provider's own price page, or `local` for work that runs on this machine without a charge. */
  readonly pricing?: EndpointPricing;
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
  const keys = options.capabilities.map((item) => refKey(item.capability));
  assert(new Set(keys).size === keys.length, "Endpoint package repeats a capability");
  const capacities = options.capabilities.map((item) => item.capacity ?? item.capability.name);
  assert(capacities.every((capacity) => capacity.trim().length > 0), "Endpoint package capacity class is empty");
  if (options.pricing?.kind === "page") {
    let url: URL | undefined;
    try { url = new URL(options.pricing.url); } catch { url = undefined; }
    assert(url?.protocol === "https:", "Endpoint pricing page must be an HTTPS URL");
  }
  const capacityConcurrency = new Map<string, number>();
  for (const capability of options.capabilities) {
    assert(capability.transient !== true || capability.lifecycle === "immediate",
      `Endpoint capability ${refKey(capability.capability)} cannot be transient and asynchronous`);
    const capacity = capability.capacity ?? capability.capability.name;
    const concurrency = positiveInteger(
      capability.maxConcurrency ?? options.defaultConcurrency ?? 1,
      `${capability.capability.name} maxConcurrency`,
    );
    const previous = capacityConcurrency.get(capacity);
    assert(previous === undefined || previous === concurrency,
      `Endpoint package capacity ${capacity} has conflicting concurrency limits`);
    capacityConcurrency.set(capacity, concurrency);
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
      ...(input?.acquisition === undefined ? {} : { acquisition: structuredClone(input.acquisition) }),
    } satisfies EndpointCredentialDescription;
  });
  const fulfills = options.capabilities.map((item) => ({
    capability: structuredClone(item.capability),
    returns: structuredClone(item.returns),
    ...(item.supports === undefined ? {} : { supports: item.supports }),
    ...(item.transient === true ? { transient: true as const } : {}),
  }));
  const instance = {
    id: options.instance,
    pool: options.pool,
  };
  const offers: readonly EndpointOffer[] = fulfills.map((item) => ({
    ...item,
    endpoint: options.instance,
  }));
  return {
    instance,
    offers,
    credentials: credentialDescriptions,
    ...(options.pricing === undefined ? {} : { pricing: structuredClone(options.pricing) }),
    install(registry) {
      for (const capability of options.capabilities) {
        const capacity = capability.capacity ?? capability.capability.name;
        const authorityConcurrency = positiveInteger(options.defaultConcurrency ?? 1, "defaultConcurrency");
        const exactConcurrency = positiveInteger(
          capability.maxConcurrency ?? authorityConcurrency,
          `${capacity} maxConcurrency`,
        );
        const common: EndpointRegistrationOptions = {
          ...(capability.supports === undefined ? {} : { supports: capability.supports }),
          ...(capability.transient === true ? { transient: true } : {}),
          credentials,
          scheduling: {
            resources: [
              {
                id: `pool:${options.pool}`,
                limit: authorityConcurrency,
              },
              {
                id: `capacity:${options.pool}/${capacity}`,
                limit: exactConcurrency,
              },
            ],
          },
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
          registry.registerAsyncEndpoint(
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
  handle: CanonicalValue,
  delayMs: number,
  now = Date.now(),
  progress?: OperationProgress,
): {
  readonly status: "pending";
  readonly handle: CanonicalValue;
  readonly wakeAt: number;
  readonly progress?: OperationProgress;
} {
  assert(Number.isSafeInteger(delayMs) && delayMs >= 0, "wake delay must be a non-negative safe integer");
  assert(Number.isSafeInteger(now) && now >= 0, "current time must be a non-negative epoch millisecond");
  return {
    status: "pending",
    handle,
    wakeAt: now + delayMs,
    ...(progress === undefined ? {} : { progress }),
  };
}
