import type { EndpointPackage } from "@narratage/endpoint-kit";
import type { HostFacet } from "@narratage/host";
import type { CanonicalValue } from "@narratage/protocol";
import { credentialRef } from "@narratage/runtime";
import type { ArtifactStore, CredentialRef, CredentialStore } from "@narratage/runtime";

export const runtimeEndpointAdapterHostAbi = "narratage.runtime-endpoint-adapter-host@1";
export const runtimeArtifactStoreAdapterHostAbi = "narratage.runtime-artifact-store-adapter-host@1";
export const runtimeCredentialStoreAdapterHostAbi = "narratage.runtime-credential-store-adapter-host@1";

export type RuntimeAdapterKind = "endpoint" | "artifact-store" | "credential-store";

type RuntimeAdapterAddress = {
  readonly use: string;
  readonly kind: RuntimeAdapterKind;
};

export type RuntimeAdapterFactoryContext = {
  readonly dataRoot: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config: CanonicalValue;
};

export type RuntimeDoctorDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type ManagedProgramCommand = {
  readonly command: string;
  readonly args: readonly string[];
};

export type ManagedProgramState =
  | { readonly state: "ready" }
  | { readonly state: "down"; readonly detail: string }
  | { readonly state: "mismatch"; readonly detail: string };

export type ManagedProgram = {
  readonly id: string;
  probe(): Promise<ManagedProgramState>;
  readonly prepare?: ManagedProgramCommand;
  readonly start?: ManagedProgramCommand;
};

export type RuntimeEndpointActivation = {
  readonly endpoint: EndpointPackage;
  readonly program?: ManagedProgram;
  readonly diagnose?: () => readonly RuntimeDoctorDiagnostic[] | Promise<readonly RuntimeDoctorDiagnostic[]>;
};

export type RuntimeOpened<T> = {
  readonly value: T;
  readonly close?: () => void | Promise<void>;
};

export type RuntimeEndpointAdapterImplementation = {
  activate(context: RuntimeAdapterFactoryContext): RuntimeEndpointActivation | Promise<RuntimeEndpointActivation>;
};

type RuntimeStoreAdapterImplementation<T> = {
  validate(context: RuntimeAdapterFactoryContext): void;
  open(context: RuntimeAdapterFactoryContext): RuntimeOpened<T> | Promise<RuntimeOpened<T>>;
  doctor?(context: RuntimeAdapterFactoryContext): readonly RuntimeDoctorDiagnostic[] | Promise<readonly RuntimeDoctorDiagnostic[]>;
};

type RuntimeAdapterImplementation =
  | RuntimeEndpointAdapterImplementation
  | RuntimeStoreAdapterImplementation<ArtifactStore>
  | RuntimeStoreAdapterImplementation<CredentialStore>;

export type RuntimeAdapterHostFacet = HostFacet & {
  readonly abi:
    | typeof runtimeEndpointAdapterHostAbi
    | typeof runtimeArtifactStoreAdapterHostAbi
    | typeof runtimeCredentialStoreAdapterHostAbi;
  readonly implementation: RuntimeAdapterImplementation;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function abiFor(kind: RuntimeAdapterKind): RuntimeAdapterHostFacet["abi"] {
  if (kind === "endpoint") return runtimeEndpointAdapterHostAbi;
  if (kind === "artifact-store") return runtimeArtifactStoreAdapterHostAbi;
  return runtimeCredentialStoreAdapterHostAbi;
}

function address(facet: RuntimeAdapterHostFacet): RuntimeAdapterAddress {
  const kind = facet.abi === runtimeEndpointAdapterHostAbi
    ? "endpoint"
    : facet.abi === runtimeArtifactStoreAdapterHostAbi
      ? "artifact-store"
      : facet.abi === runtimeCredentialStoreAdapterHostAbi ? "credential-store" : undefined;
  assert(kind !== undefined, `Runtime Adapter ${facet.abi} ABI is unsupported`);
  assert(facet.offers?.length === 1 && facet.offers[0]!.trim().length > 0,
    "Runtime Adapter must offer exactly one non-empty use name");
  return { use: facet.offers[0]!, kind };
}

function verifyImplementation(value: unknown, subject: string, kind: RuntimeAdapterKind): RuntimeAdapterImplementation {
  assert(value !== null && typeof value === "object", `${subject} implementation is not an object`);
  if (kind === "endpoint") {
    assert(typeof (value as { activate?: unknown }).activate === "function", `${subject} does not implement activate()`);
    return value as RuntimeEndpointAdapterImplementation;
  }
  assert(typeof (value as { validate?: unknown }).validate === "function", `${subject} does not implement validate()`);
  assert(typeof (value as { open?: unknown }).open === "function", `${subject} does not implement open()`);
  const doctor = (value as { doctor?: unknown }).doctor;
  assert(doctor === undefined || typeof doctor === "function", `${subject}.doctor must be a function`);
  return value as RuntimeAdapterImplementation;
}

function storeFacet<T>(kind: "artifact-store" | "credential-store", options: {
  readonly use: string;
  readonly validate: RuntimeStoreAdapterImplementation<T>["validate"];
  readonly open: RuntimeStoreAdapterImplementation<T>["open"];
  readonly doctor?: RuntimeStoreAdapterImplementation<T>["doctor"];
}): RuntimeAdapterHostFacet {
  assert(options.use.trim().length > 0, "Runtime Adapter use name is empty");
  const implementation = {
    validate: options.validate,
    open: options.open,
    ...(options.doctor === undefined ? {} : { doctor: options.doctor }),
  };
  return {
    abi: abiFor(kind),
    offers: [options.use],
    implementation: verifyImplementation(implementation, `Runtime Adapter ${options.use}`, kind),
  };
}

export function createRuntimeEndpointAdapterFacet(options: {
  readonly use: string;
  readonly activate: RuntimeEndpointAdapterImplementation["activate"];
}): RuntimeAdapterHostFacet {
  assert(options.use.trim().length > 0, "Runtime Adapter use name is empty");
  return {
    abi: runtimeEndpointAdapterHostAbi,
    offers: [options.use],
    implementation: verifyImplementation({ activate: options.activate }, `Runtime Adapter ${options.use}`, "endpoint"),
  };
}

export function createRuntimeArtifactStoreAdapterFacet(options: {
  readonly use: string;
  readonly validate: RuntimeStoreAdapterImplementation<ArtifactStore>["validate"];
  readonly open: RuntimeStoreAdapterImplementation<ArtifactStore>["open"];
  readonly doctor?: RuntimeStoreAdapterImplementation<ArtifactStore>["doctor"];
}): RuntimeAdapterHostFacet {
  return storeFacet("artifact-store", options);
}

export function createRuntimeCredentialStoreAdapterFacet(options: {
  readonly use: string;
  readonly validate: RuntimeStoreAdapterImplementation<CredentialStore>["validate"];
  readonly open: RuntimeStoreAdapterImplementation<CredentialStore>["open"];
  readonly doctor?: RuntimeStoreAdapterImplementation<CredentialStore>["doctor"];
}): RuntimeAdapterHostFacet {
  return storeFacet("credential-store", options);
}

export function isRuntimeAdapterHostFacet(value: HostFacet): value is RuntimeAdapterHostFacet {
  try {
    const resolved = address(value as RuntimeAdapterHostFacet);
    verifyImplementation(value.implementation, "Runtime Adapter", resolved.kind);
    return true;
  } catch {
    return false;
  }
}

export class RuntimeAdapterRegistry {
  readonly #registrations = new Map<string, RuntimeAdapterImplementation>();

  #key(use: string, kind: RuntimeAdapterKind): string {
    return `${kind}\u0000${use}`;
  }

  registerFacet(facet: HostFacet): void {
    assert(isRuntimeAdapterHostFacet(facet), `Host facet ${facet.abi} is not a valid Runtime Adapter`);
    const resolved = address(facet);
    const key = this.#key(resolved.use, resolved.kind);
    assert(!this.#registrations.has(key), `Runtime ${resolved.kind} Adapter ${resolved.use} is already registered`);
    this.#registrations.set(key, facet.implementation);
  }

  has(use: string, kind: RuntimeAdapterKind): boolean {
    return this.#registrations.has(this.#key(use, kind));
  }

  async activateEndpoint(use: string, context: RuntimeAdapterFactoryContext): Promise<RuntimeEndpointActivation> {
    const implementation = this.#registrations.get(this.#key(use, "endpoint")) as RuntimeEndpointAdapterImplementation | undefined;
    assert(implementation !== undefined, `Runtime Endpoint adapter ${use} is not registered`);
    const activation = await implementation.activate(context);
    assert(activation.endpoint.instance.id === context.instance,
      `Runtime Endpoint adapter ${use} created Endpoint ${activation.endpoint.instance.id} outside configured instance ${context.instance}`);
    return activation;
  }

  async createEndpoint(use: string, context: RuntimeAdapterFactoryContext): Promise<EndpointPackage> {
    return (await this.activateEndpoint(use, context)).endpoint;
  }

  async #openStore<T>(use: string, kind: "artifact-store" | "credential-store", context: RuntimeAdapterFactoryContext): Promise<RuntimeOpened<T>> {
    const implementation = this.#registrations.get(this.#key(use, kind)) as RuntimeStoreAdapterImplementation<T> | undefined;
    assert(implementation !== undefined, `Runtime ${kind} adapter ${use} is not registered`);
    implementation.validate(context);
    const opened = await implementation.open(context);
    assert(opened.value !== null && typeof opened.value === "object", `Runtime ${kind} adapter ${use} returned no value`);
    return opened;
  }

  async openArtifactStore(use: string, context: RuntimeAdapterFactoryContext): Promise<RuntimeOpened<ArtifactStore>> {
    return await this.#openStore(use, "artifact-store", context);
  }

  async openCredentialStore(use: string, context: RuntimeAdapterFactoryContext): Promise<RuntimeOpened<CredentialStore>> {
    return await this.#openStore(use, "credential-store", context);
  }

  validate(use: string, kind: Exclude<RuntimeAdapterKind, "endpoint">, context: RuntimeAdapterFactoryContext): readonly RuntimeDoctorDiagnostic[] {
    const implementation = this.#registrations.get(this.#key(use, kind)) as RuntimeStoreAdapterImplementation<unknown> | undefined;
    if (implementation === undefined) return [{
      severity: "error", code: "RUNTIME_ADAPTER_MISSING", message: `Runtime Adapter ${use} is not registered`, subject: use,
    }];
    implementation.validate(context);
    return [];
  }

  async doctor(use: string, kind: Exclude<RuntimeAdapterKind, "endpoint">, context: RuntimeAdapterFactoryContext): Promise<readonly RuntimeDoctorDiagnostic[]> {
    const implementation = this.#registrations.get(this.#key(use, kind)) as RuntimeStoreAdapterImplementation<unknown> | undefined;
    if (implementation === undefined) return [{
      severity: "error", code: "RUNTIME_ADAPTER_MISSING", message: `Runtime Adapter ${use} is not registered`, subject: use,
    }];
    return implementation.doctor === undefined ? [] : await implementation.doctor(context);
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
