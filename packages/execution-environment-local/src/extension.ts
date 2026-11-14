import { endpointActions } from "@hypit/endpoint";
import type { EndpointInstance } from "@hypit/endpoint";
import type { Facet } from "@hypit/facet";
import type { CanonicalValue } from "@hypit/protocol";
import { credentialRef } from "@hypit/execution-environment";
import type { CredentialRef, CredentialStore, CredentialValue } from "@hypit/execution-environment";

export { credentialRef, verifyCredentialRef } from "@hypit/execution-environment";
export type { CredentialRef, CredentialStore, CredentialValue, WritableCredentialStore } from "@hypit/execution-environment";

export const executionEnvironmentEndpointAdapterFacetKind = "hypit.execution-environment-local-endpoint-adapter";
export const executionEnvironmentCredentialStoreAdapterFacetKind = "hypit.execution-environment-local-credential-store-adapter";

export type ExecutionEnvironmentAdapterKind = "endpoint" | "credential-store";

type ExecutionEnvironmentAdapterAddress = {
  readonly use: string;
  readonly kind: ExecutionEnvironmentAdapterKind;
};

export type ExecutionEnvironmentAdapterFactoryContext = {
  /** Persistent machine/user state supplied by the Host, outside every author project. */
  readonly hostStateRoot: string;
  /** State root selected by this local execution-environment deployment. */
  readonly dataRoot: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config: CanonicalValue;
};

export type ExecutionEnvironmentDoctorDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type ManagedProgramCommand = {
  /** Optional human-readable purpose, supplied by the program owner. Not a lifecycle state. */
  readonly label?: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
};

export type ManagedProgramInstallation = {
  /** Read-only inspection of the selected environment and resources; no downloads or receipts. */
  probe(): Promise<ManagedProgramState>;
  /** Reconcile an installed environment before a cold start, using its package manager's cache. */
  readonly prepareBeforeStart?: boolean;
  /** Explicit preparation commands, run for missing resources or cold reconciliation above. */
  readonly commands: readonly ManagedProgramCommand[];
};

export type ManagedProgramState =
  | { readonly state: "ready" }
  | { readonly state: "down"; readonly detail: string }
  | { readonly state: "mismatch"; readonly detail: string };

export type ManagedProgram = {
  readonly id: string;
  /** Shared lifecycle files live here; absent means this Environment owns them. */
  readonly stateRoot?: string;
  /** Installation and runtime readiness are deliberately separate states. */
  readonly installation?: ManagedProgramInstallation;
  probe(): Promise<ManagedProgramState>;
  readonly start?: ManagedProgramCommand;
};

export type ExecutionEnvironmentEndpointActivation = {
  readonly endpoint: EndpointInstance;
  readonly program?: ManagedProgram;
  readonly diagnose?: (context: {
    readonly credentials: Readonly<Record<string, CredentialValue>>;
    readonly capabilities?: readonly import("@hypit/module").CapabilityRef[];
  }) => readonly ExecutionEnvironmentDoctorDiagnostic[] | Promise<readonly ExecutionEnvironmentDoctorDiagnostic[]>;
};

export type ExecutionEnvironmentOpened<T> = {
  readonly value: T;
  readonly close?: () => void | Promise<void>;
};

export type ExecutionEnvironmentEndpointAdapterImplementation = {
  activate(context: ExecutionEnvironmentAdapterFactoryContext): ExecutionEnvironmentEndpointActivation | Promise<ExecutionEnvironmentEndpointActivation>;
};

type ExecutionEnvironmentStoreAdapterImplementation<T> = {
  validate(context: ExecutionEnvironmentAdapterFactoryContext): void;
  open(context: ExecutionEnvironmentAdapterFactoryContext): ExecutionEnvironmentOpened<T> | Promise<ExecutionEnvironmentOpened<T>>;
  doctor?(context: ExecutionEnvironmentAdapterFactoryContext): readonly ExecutionEnvironmentDoctorDiagnostic[] | Promise<readonly ExecutionEnvironmentDoctorDiagnostic[]>;
};

type ExecutionEnvironmentAdapterImplementation =
  | ExecutionEnvironmentEndpointAdapterImplementation
  | ExecutionEnvironmentStoreAdapterImplementation<CredentialStore>;

export type ExecutionEnvironmentAdapterFacet = Facet & {
  readonly kind:
    | typeof executionEnvironmentEndpointAdapterFacetKind
    | typeof executionEnvironmentCredentialStoreAdapterFacetKind;
  readonly implementation: ExecutionEnvironmentAdapterImplementation;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function facetKindFor(kind: ExecutionEnvironmentAdapterKind): ExecutionEnvironmentAdapterFacet["kind"] {
  if (kind === "endpoint") return executionEnvironmentEndpointAdapterFacetKind;
  return executionEnvironmentCredentialStoreAdapterFacetKind;
}

function address(facet: ExecutionEnvironmentAdapterFacet): ExecutionEnvironmentAdapterAddress {
  const kind = facet.kind === executionEnvironmentEndpointAdapterFacetKind
    ? "endpoint"
    : facet.kind === executionEnvironmentCredentialStoreAdapterFacetKind ? "credential-store" : undefined;
  assert(kind !== undefined, `Execution Environment Adapter kind ${facet.kind} is unsupported`);
  assert(facet.address !== undefined && facet.address.trim().length > 0,
    "Execution Environment Adapter must declare one non-empty use name");
  return { use: facet.address, kind };
}

function verifyImplementation(value: unknown, subject: string, kind: ExecutionEnvironmentAdapterKind): ExecutionEnvironmentAdapterImplementation {
  assert(value !== null && typeof value === "object", `${subject} implementation is not an object`);
  if (kind === "endpoint") {
    assert(typeof (value as { activate?: unknown }).activate === "function", `${subject} does not implement activate()`);
    return value as ExecutionEnvironmentEndpointAdapterImplementation;
  }
  assert(typeof (value as { validate?: unknown }).validate === "function", `${subject} does not implement validate()`);
  assert(typeof (value as { open?: unknown }).open === "function", `${subject} does not implement open()`);
  const doctor = (value as { doctor?: unknown }).doctor;
  assert(doctor === undefined || typeof doctor === "function", `${subject}.doctor must be a function`);
  return value as ExecutionEnvironmentAdapterImplementation;
}

function storeFacet<T>(kind: "credential-store", options: {
  readonly use: string;
  readonly validate: ExecutionEnvironmentStoreAdapterImplementation<T>["validate"];
  readonly open: ExecutionEnvironmentStoreAdapterImplementation<T>["open"];
  readonly doctor?: ExecutionEnvironmentStoreAdapterImplementation<T>["doctor"];
}): ExecutionEnvironmentAdapterFacet {
  assert(options.use.trim().length > 0, "Environment Adapter use name is empty");
  const implementation = {
    validate: options.validate,
    open: options.open,
    ...(options.doctor === undefined ? {} : { doctor: options.doctor }),
  };
  return {
    kind: facetKindFor(kind),
    address: options.use,
    implementation: verifyImplementation(implementation, `Environment Adapter ${options.use}`, kind),
  };
}

export function createExecutionEnvironmentEndpointAdapterFacet(options: {
  readonly use: string;
  readonly activate: ExecutionEnvironmentEndpointAdapterImplementation["activate"];
}): ExecutionEnvironmentAdapterFacet {
  assert(options.use.trim().length > 0, "Environment Adapter use name is empty");
  return {
    kind: executionEnvironmentEndpointAdapterFacetKind,
    address: options.use,
    implementation: verifyImplementation({ activate: options.activate }, `Environment Adapter ${options.use}`, "endpoint"),
  };
}

export function createExecutionEnvironmentCredentialStoreAdapterFacet(options: {
  readonly use: string;
  readonly validate: ExecutionEnvironmentStoreAdapterImplementation<CredentialStore>["validate"];
  readonly open: ExecutionEnvironmentStoreAdapterImplementation<CredentialStore>["open"];
  readonly doctor?: ExecutionEnvironmentStoreAdapterImplementation<CredentialStore>["doctor"];
}): ExecutionEnvironmentAdapterFacet {
  return storeFacet("credential-store", options);
}

export function isExecutionEnvironmentAdapterFacet(value: Facet): value is ExecutionEnvironmentAdapterFacet {
  try {
    const resolved = address(value as ExecutionEnvironmentAdapterFacet);
    verifyImplementation(value.implementation, "Environment Adapter", resolved.kind);
    return true;
  } catch {
    return false;
  }
}

export class ExecutionEnvironmentAdapterRegistry {
  readonly #registrations = new Map<string, ExecutionEnvironmentAdapterImplementation>();

  #key(use: string, kind: ExecutionEnvironmentAdapterKind): string {
    return `${kind}\u0000${use}`;
  }

  registerFacet(facet: Facet): void {
    assert(isExecutionEnvironmentAdapterFacet(facet), `Facet ${facet.kind} is not a valid Environment Adapter`);
    const resolved = address(facet);
    const key = this.#key(resolved.use, resolved.kind);
    assert(!this.#registrations.has(key), `Environment ${resolved.kind} Adapter ${resolved.use} is already registered`);
    this.#registrations.set(key, facet.implementation);
  }

  has(use: string, kind: ExecutionEnvironmentAdapterKind): boolean {
    return this.#registrations.has(this.#key(use, kind));
  }

  async activateEndpoint(use: string, context: ExecutionEnvironmentAdapterFactoryContext): Promise<ExecutionEnvironmentEndpointActivation> {
    const implementation = this.#registrations.get(this.#key(use, "endpoint")) as ExecutionEnvironmentEndpointAdapterImplementation | undefined;
    assert(implementation !== undefined, `Environment Endpoint Adapter ${use} is not registered`);
    const activation = await implementation.activate(context);
    assert(activation.endpoint.instance.id === context.instance,
      `Environment Endpoint Adapter ${use} created Endpoint ${activation.endpoint.instance.id} outside configured instance ${context.instance}`);
    return activation;
  }

  async createEndpoint(use: string, context: ExecutionEnvironmentAdapterFactoryContext): Promise<EndpointInstance> {
    return (await this.activateEndpoint(use, context)).endpoint;
  }

  async #openStore<T>(use: string, kind: "credential-store", context: ExecutionEnvironmentAdapterFactoryContext): Promise<ExecutionEnvironmentOpened<T>> {
    const implementation = this.#registrations.get(this.#key(use, kind)) as ExecutionEnvironmentStoreAdapterImplementation<T> | undefined;
    assert(implementation !== undefined, `Environment ${kind} adapter ${use} is not registered`);
    implementation.validate(context);
    const opened = await implementation.open(context);
    assert(opened.value !== null && typeof opened.value === "object", `Environment ${kind} adapter ${use} returned no value`);
    return opened;
  }

  async openCredentialStore(use: string, context: ExecutionEnvironmentAdapterFactoryContext): Promise<ExecutionEnvironmentOpened<CredentialStore>> {
    return await this.#openStore(use, "credential-store", context);
  }

  validate(use: string, kind: Exclude<ExecutionEnvironmentAdapterKind, "endpoint">, context: ExecutionEnvironmentAdapterFactoryContext): readonly ExecutionEnvironmentDoctorDiagnostic[] {
    const implementation = this.#registrations.get(this.#key(use, kind)) as ExecutionEnvironmentStoreAdapterImplementation<unknown> | undefined;
    if (implementation === undefined) return [{
      severity: "error", code: "ENVIRONMENT_ADAPTER_MISSING", message: `Environment Adapter ${use} is not registered`, subject: use,
    }];
    implementation.validate(context);
    return [];
  }

  async doctor(use: string, kind: Exclude<ExecutionEnvironmentAdapterKind, "endpoint">, context: ExecutionEnvironmentAdapterFactoryContext): Promise<readonly ExecutionEnvironmentDoctorDiagnostic[]> {
    const implementation = this.#registrations.get(this.#key(use, kind)) as ExecutionEnvironmentStoreAdapterImplementation<unknown> | undefined;
    if (implementation === undefined) return [{
      severity: "error", code: "ENVIRONMENT_ADAPTER_MISSING", message: `Environment Adapter ${use} is not registered`, subject: use,
    }];
    return implementation.doctor === undefined ? [] : await implementation.doctor(context);
  }
}

export function executionEnvironmentConfigObject(value: CanonicalValue, subject: string): Record<string, CanonicalValue> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} config must be an object`);
  return value as Record<string, CanonicalValue>;
}

export function executionEnvironmentConfigExact(value: Record<string, CanonicalValue>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  assert(unknown.length === 0, `${subject} config does not accept ${unknown[0]}`);
}

export function executionEnvironmentConfigString(value: CanonicalValue | undefined, subject: string): string | undefined {
  if (value === undefined) return undefined;
  assert(typeof value === "string" && value.trim().length > 0, `${subject} must be a non-empty string`);
  return value;
}

export function executionEnvironmentConfigPositiveInteger(value: CanonicalValue | undefined, subject: string): number | undefined {
  if (value === undefined) return undefined;
  assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

export function executionEnvironmentConfigBoolean(value: CanonicalValue | undefined, subject: string): boolean | undefined {
  if (value === undefined) return undefined;
  assert(typeof value === "boolean", `${subject} must be a boolean`);
  return value;
}

export function executionEnvironmentConfigCredentialRef(
  value: CanonicalValue | undefined,
  subject: string,
): CredentialRef | undefined {
  if (value === undefined) return undefined;
  const object = executionEnvironmentConfigObject(value, subject);
  executionEnvironmentConfigExact(object, ["store", "key"], subject);
  const store = executionEnvironmentConfigString(object.store, `${subject}.store`);
  const key = executionEnvironmentConfigString(object.key, `${subject}.key`);
  assert(store !== undefined && key !== undefined, `${subject} requires store and key`);
  return credentialRef(store, key);
}

/** Common Profile representation for short action occupancy and rate budgets. */
export function executionEnvironmentConfigActionLimits(value: CanonicalValue | undefined): import("@hypit/endpoint").EndpointActionLimits | undefined {
  if (value === undefined) return undefined;
  const actions = executionEnvironmentConfigObject(value, "actionLimits");
  executionEnvironmentConfigExact(actions, endpointActions, "actionLimits");
  return Object.fromEntries(Object.entries(actions).map(([action, raw]) => {
    const limit = executionEnvironmentConfigObject(raw, `actionLimits.${action}`);
    executionEnvironmentConfigExact(limit, ["concurrency", "rate"], `actionLimits.${action}`);
    const concurrency = executionEnvironmentConfigPositiveInteger(limit.concurrency, `${action} concurrency`);
    let rate: { limit: number; periodMs: number } | undefined;
    if (limit.rate !== undefined) {
      const item = executionEnvironmentConfigObject(limit.rate, `${action} rate`);
      executionEnvironmentConfigExact(item, ["limit", "periodMs"], `${action} rate`);
      const units = executionEnvironmentConfigPositiveInteger(item.limit, `${action} rate.limit`);
      const periodMs = executionEnvironmentConfigPositiveInteger(item.periodMs, `${action} rate.periodMs`);
      if (units === undefined || periodMs === undefined) throw new Error(`${action} rate requires limit and periodMs`);
      rate = { limit: units, periodMs };
    }
    return [action, { ...(concurrency === undefined ? {} : { concurrency }), ...(rate === undefined ? {} : { rate }) }];
  }));
}
