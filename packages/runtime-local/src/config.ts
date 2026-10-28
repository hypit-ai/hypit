import { fileExecutionLogs } from "./log.js";
import { constants } from "node:fs";
import { access, readFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  loadNodePackageSelection,
} from "@hypit/hypit/loader/node";
import type { NodePackageSelectionRequest } from "@hypit/hypit/loader/node";
import { hypitHostStateRoot } from "@hypit/hypit/cli";
import { EndpointRegistry, Executor } from "@hypit/hypit/executor";
import type { EndpointCredential, EndpointInstance, EndpointRegistrar, EndpointScheduling } from "@hypit/hypit/endpoint";
import { endpointOffers, endpointResourceClaims, installEndpoint, verifyEndpointPricingDocument } from "@hypit/hypit/endpoint";
import { assertBuildId, canonicalize, capabilityKey, compareCodeUnits, parseCapabilityKey } from "@hypit/hypit/protocol";
import type { CanonicalValue, CapabilityRef, Need, Value } from "@hypit/hypit/protocol";
import {
  CompositeCredentialStore,
  InProcessBuildScheduler,
  capacityUnits,
  writableCredentialStore,
} from "@hypit/hypit/runtime";
import type { CredentialStore, CredentialValue, ResourceStore } from "@hypit/hypit/runtime";
import type { BuildResultRepositoryLocation } from "./execution.js";
import { FileBuildResultRepository } from "@hypit/hypit/result/node";
import type { BuildResultRepository } from "@hypit/hypit/result";
import { FileResourceStore } from "./resource-store.js";
import {
  isRuntimeAdapterFacet,
  runtimeCredentialStoreAdapterFacetAbi,
  runtimeEndpointAdapterFacetAbi,
  RuntimeAdapterRegistry,
} from "@hypit/runtime-local/extension";
import type {
  ManagedProgram,
  ManagedProgramState,
  RuntimeAdapterFactoryContext,
  RuntimeDoctorDiagnostic,
  RuntimeEndpointActivation,
  RuntimeOpened,
} from "@hypit/runtime-local/extension";
import type {
  RuntimeHostEndpointObservation,
  RuntimeHostEndpointPricing,
  RuntimeHostEndpointQuery,
  RuntimeHostTransientExecution,
  RuntimeInvocationObservation,
} from "./host-api.js";
import { SqliteRuntimeState } from "./sqlite-state.js";

import { applyEndpointBindings, createLocalRuntime } from "./runtime.js";
import {
  createLocalRuntimeControl,
} from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
import { createLocalResultWriter } from "./result-writer.js";
import type {
  LocalCredentialControl,
  LocalResultWriter,
  LocalRuntime,
  LocalRuntimeControl,
} from "./types.js";

export type LocalRuntimeAdapterSelection = {
  readonly use: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config?: CanonicalValue;
};

export type LocalRuntimeProfile = {
  readonly format: "hypit.runtime-local@1";
  readonly dataRoot: string;
  /** Coordinator policy, independent of any Build's selected Endpoints. */
  readonly worker?: { readonly executionMemoryMb: number };
  readonly credentials: readonly LocalRuntimeAdapterSelection[];
  readonly endpoints: readonly LocalRuntimeAdapterSelection[];
  /**
   * Capability key (`name@version#capability`) to Endpoint instance, for capabilities that several
   * selected Endpoints offer. Providers declare everything they can do; this is where the deployment
   * says who does it.
   */
  readonly bindings: Readonly<Record<string, string>>;
};

export type ProjectBuildResultDoctorResult = {
  readonly location?: BuildResultRepositoryLocation;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

export type LoadRuntimeConfigOptions = {
  readonly registry?: RuntimeAdapterRegistry;
  /** Execution-owned module bindings; omitted for ordinary short-lived CLI calls. */
  readonly importModule?: (url: string) => Promise<unknown>;
  readonly endpoints?: readonly string[];
  readonly packageRoot?: string;
  readonly distributionPackageRoot?: string;
  /** Persistent machine/user state. Defaults to the platform Hypit state root. */
  readonly hostStateRoot?: string;
};

export type RuntimeConfigDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

export type RuntimeConfigInspection = {
  readonly dataRoot: string;
  endpoints(): Promise<readonly RuntimeHostEndpointObservation[]>;
  pricing(): Promise<readonly RuntimeHostEndpointPricing[]>;
  preflight(): Promise<RuntimeConfigDoctorResult>;
  createRuntime(): Promise<LocalRuntime>;
  close(): void | Promise<void>;
};

type RuntimeInspectionOptions = LoadRuntimeConfigOptions & {
  readonly capabilities?: readonly CapabilityRef[];
  readonly endpoints?: readonly string[];
  readonly active: boolean;
};

/** Explicit deployment scope. Bindings narrow discovery before unused packages are loaded. */
function scopedProfile(document: LocalRuntimeProfile, scope: {
  readonly endpoints?: readonly string[];
  readonly capabilities?: readonly CapabilityRef[];
}): LocalRuntimeProfile {
  const bound = scope.capabilities?.map((capability) => document.bindings[capabilityKey(capability)]);
  const names = scope.endpoints ?? (bound?.every((name) => name !== undefined) ? bound as string[] : undefined);
  if (names === undefined) return document;
  for (const name of names) {
    if (!document.endpoints.some((item) => item.instance === name)) throw new Error(`Runtime Profile has no Endpoint ${name}`);
  }
  const selected = new Set(names);
  return { ...document,
    endpoints: document.endpoints.filter((item) => selected.has(item.instance)),
    bindings: Object.fromEntries(Object.entries(document.bindings).filter(([, name]) => selected.has(name))),
  };
}

function requestsCapability(document: LocalRuntimeProfile, instance: string, capability: CapabilityRef,
  requested: ReadonlySet<string> | undefined): boolean {
  const key = capabilityKey(capability);
  return requested === undefined || requested.has(key)
    && (document.bindings[key] === undefined || document.bindings[key] === instance);
}

export type ResolvedRuntimeConfigPaths = {
  readonly packageRoot: string;
  readonly dataRoot: string;
};

type OpenedRuntimeConfig = {
  readonly absolute: string;
  readonly document: LocalRuntimeProfile;
  readonly root: string;
  readonly profileRoot: string;
  readonly packageRoot: string;
};

type DeclaredManagedProgram = {
  readonly instance: string;
  readonly program: ManagedProgram;
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${subject} does not accept ${unknown.join(", ")}; it accepts ${allowed.join(", ")}`);
  }
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function entry(value: unknown, instance: string, subject: string, poolAllowed = false): LocalRuntimeAdapterSelection {
  const item = object(value, subject);
  exactKeys(item, poolAllowed ? ["use", "pool", "config"] : ["use", "config"], subject);
  const pool = item.pool === undefined ? undefined : requiredString(item.pool, `${subject}.pool`);
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance,
    ...(pool === undefined ? {} : { pool }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}

function entries(value: unknown, subject: string, poolAllowed = false): readonly LocalRuntimeAdapterSelection[] {
  const values = object(value ?? {}, subject);
  return Object.entries(values).sort(([left], [right]) => compareCodeUnits(left, right)).map(([instance, item]) => {
    requiredString(instance, `${subject} instance`);
    return entry(item, instance, `${subject}.${instance}`, poolAllowed);
  });
}

function bindings(value: unknown, endpoints: readonly LocalRuntimeAdapterSelection[]): Readonly<Record<string, string>> {
  const values = object(value ?? {}, "$runtime.bindings");
  const instances = new Set(endpoints.map((item) => item.instance));
  const result: Record<string, string> = {};
  for (const [key, target] of Object.entries(values).sort(([left], [right]) => compareCodeUnits(left, right))) {
    parseCapabilityKey(key);
    const instance = requiredString(target, `$runtime.bindings.${key}`);
    if (!instances.has(instance)) {
      throw new Error(`$runtime.bindings.${key} names ${instance}, which is not an Endpoint instance of this Profile (${[...instances].sort().join(", ")})`);
    }
    result[key] = instance;
  }
  return result;
}

export function parseLocalRuntimeProfile(value: unknown): LocalRuntimeProfile {
  const item = object(value, "$runtime");
  exactKeys(item, ["format", "dataRoot", "worker", "credentials", "endpoints", "bindings"], "$runtime");
  if (item.format !== "hypit.runtime-local@1") {
    throw new Error("$runtime.format must be hypit.runtime-local@1");
  }
  const credentials = entries(item.credentials, "$runtime.credentials");
  const endpoints = entries(item.endpoints, "$runtime.endpoints", true);
  const ids = [...credentials, ...endpoints].map((value) => value.instance);
  if (new Set(ids).size !== ids.length) throw new Error("$runtime repeats a Runtime instance id");
  let worker: LocalRuntimeProfile["worker"];
  if (item.worker !== undefined) {
    const settings = object(item.worker, "$runtime.worker");
    exactKeys(settings, ["executionMemoryMb"], "$runtime.worker");
    const budget = settings.executionMemoryMb;
    if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget <= 0) {
      throw new Error("$runtime.worker.executionMemoryMb must be a positive integer in MiB");
    }
    worker = { executionMemoryMb: budget };
  }
  return {
    format: "hypit.runtime-local@1",
    dataRoot: requiredString(item.dataRoot, "$runtime.dataRoot"),
    ...(worker === undefined ? {} : { worker }),
    credentials,
    endpoints,
    bindings: bindings(item.bindings, endpoints),
  };
}

/** Read only process policy; starting a coordinator does not load selected project packages. */
export async function readRuntimeWorkerOptions(path: string): Promise<{ readonly executionMemoryMb: number }> {
  return (await openRuntimeConfig(path)).document.worker ?? { executionMemoryMb: 1024 };
}

async function openRuntimeConfig(path: string, packageRootHint?: string): Promise<OpenedRuntimeConfig> {
  const absolute = resolve(path);
  const source = await readFile(absolute, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`Runtime Profile ${absolute} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error });
  }
  const document = parseLocalRuntimeProfile(value);
  const profileRoot = dirname(absolute);
  return {
    absolute,
    document,
    root: resolve(profileRoot, document.dataRoot),
    profileRoot,
    packageRoot: resolve(packageRootHint ?? profileRoot),
  };
}

function runtimePackageSelection(document: LocalRuntimeProfile): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [
      ...document.credentials.map((item) => ({ abi: runtimeCredentialStoreAdapterFacetAbi, name: item.use })),
      ...document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterFacetAbi, name: item.use })),
    ],
  };
}

function endpointAdapterSelection(document: LocalRuntimeProfile): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterFacetAbi, name: item.use })),
  };
}

async function installRuntimeAdapters(
  registry: RuntimeAdapterRegistry,
  packageRoot: string,
  selection: NodePackageSelectionRequest,
  distributionPackageRoot?: string,
  importModule?: (url: string) => Promise<unknown>,
): Promise<void> {
  const logical = selection.logical?.filter((address) => {
    if (address.abi === runtimeEndpointAdapterFacetAbi) return !registry.has(address.name, "endpoint");
    if (address.abi === runtimeCredentialStoreAdapterFacetAbi) return !registry.has(address.name, "credential-store");
    return true;
  }) ?? [];
  if (selection.selected.length === 0 && logical.length === 0) return;
  const loaded = await loadNodePackageSelection({ selected: selection.selected, logical }, packageRoot, {
    ...(importModule === undefined ? {} : { importModule }),
    ...(distributionPackageRoot === undefined ? {} : { fallbackRoots: [distributionPackageRoot] }),
  });
  for (const item of loaded) {
    for (const facet of item.contribution.facets ?? []) {
      if (isRuntimeAdapterFacet(facet)) registry.registerFacet(facet);
    }
  }
}

async function openBuildResultLocation(
  location: BuildResultRepositoryLocation,
): Promise<{ readonly repository: BuildResultRepository }> {
  return { repository: new FileBuildResultRepository(resolve(location.root, location.path)) };
}

export async function openBuildResultRepositoryLocation(
  location: BuildResultRepositoryLocation,
): Promise<{ readonly repository: BuildResultRepository }> {
  return await openBuildResultLocation(location);
}

export async function openProjectBuildResultRepository(
  projectRoot: string,
): Promise<{ readonly repository: BuildResultRepository; readonly location: BuildResultRepositoryLocation }> {
  const location = projectBuildResultLocation(projectRoot);
  const result = await openBuildResultLocation(location);
  return { ...result, location };
}

function projectBuildResultLocation(projectRoot: string): BuildResultRepositoryLocation {
  return { root: resolve(projectRoot), path: ".hypit/results" };
}

/** Diagnose the project-owned Result Store without reading Result history or mutating storage. */
export async function doctorProjectBuildResultRepository(
  projectRoot: string,
): Promise<ProjectBuildResultDoctorResult> {
  const location = projectBuildResultLocation(projectRoot);
  const resultRoot = resolve(location.root, location.path);
  let current = resultRoot;
  try {
    while (true) {
      const found = await stat(current).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
        throw error;
      });
      if (found !== undefined) {
        if (!found.isDirectory()) throw new Error(`${current} is not a directory`);
        await access(current, constants.R_OK | constants.W_OK);
        return { location, diagnostics: [] };
      }
      const parent = dirname(current);
      if (parent === current) throw new Error(`no existing parent directory for ${resultRoot}`);
      current = parent;
    }
  } catch (error) {
    return {
      location,
      diagnostics: [{
        severity: "error",
        code: "RESULT_DIRECTORY_UNAVAILABLE",
        message: error instanceof Error ? error.message : String(error),
        subject: resultRoot,
      }],
    };
  }
}

export async function resolveRuntimeConfigPaths(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<ResolvedRuntimeConfigPaths> {
  const opened = await openRuntimeConfig(path, options.packageRoot);
  return { packageRoot: opened.packageRoot, dataRoot: opened.root };
}

function adapterContext(
  root: string,
  hostStateRoot: string,
  item: LocalRuntimeAdapterSelection,
): RuntimeAdapterFactoryContext {
  return {
    hostStateRoot,
    dataRoot: root,
    instance: item.instance,
    ...(item.pool === undefined ? {} : { pool: item.pool }),
    config: item.config ?? {},
  };
}

async function activatedEndpoints(
  document: LocalRuntimeProfile,
  root: string,
  hostStateRoot: string,
  registry: RuntimeAdapterRegistry,
): Promise<readonly { readonly entry: LocalRuntimeAdapterSelection; readonly activation: RuntimeEndpointActivation }[]> {
  return await Promise.all(document.endpoints.map(async (item) => ({
    entry: item,
    activation: await registry.activateEndpoint(item.use, adapterContext(root, hostStateRoot, {
      ...item,
      pool: item.pool ?? item.instance,
    })),
  })));
}

function credentialProfile(document: LocalRuntimeProfile, endpoints: readonly EndpointInstance[]): LocalRuntimeProfile {
  const used = new Set(endpoints.flatMap((endpoint) => endpoint.credentials.map((slot) => slot.ref.store)));
  return { ...document, credentials: document.credentials.filter((item) => used.has(item.instance)) };
}

export async function declaredManagedPrograms(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[]; readonly endpoints?: readonly string[] } = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly DeclaredManagedProgram[] }> {
  const opened = await openRuntimeConfig(path, options.packageRoot);
  const { root, packageRoot } = opened;
  const document = scopedProfile(opened.document, options);
  if (options.capabilities?.length === 0) return { dataRoot: root, programs: [] };
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, endpointAdapterSelection(document), options.distributionPackageRoot);
  const requested = options.capabilities === undefined
    ? undefined
    : new Set(options.capabilities.map(capabilityKey));
  const programs: DeclaredManagedProgram[] = [];
  for (const { entry, activation } of await activatedEndpoints(document, root, hostStateRoot, registry)) {
    if (requested !== undefined && !endpointOffers(activation.endpoint).some((offer) => requestsCapability(document, entry.instance, offer.capability, requested))) continue;
    if (activation.program !== undefined) programs.push({ instance: entry.instance, program: activation.program });
  }
  return { dataRoot: root, programs };
}

/**
 * A registry of every selected Endpoint with the Profile's bindings applied: the one resolver that
 * `plan`, creation-time `invoke` and a Build share, so all three see the same Endpoint for a Need.
 */
async function installedEndpointRegistry(
  document: LocalRuntimeProfile,
  activations: readonly { readonly entry: LocalRuntimeAdapterSelection; readonly activation: RuntimeEndpointActivation }[],
): Promise<EndpointRegistry> {
  const endpoints = new EndpointRegistry();
  for (const { activation } of activations) await installEndpoint(activation.endpoint, endpoints);
  applyEndpointBindings(endpoints, document.bindings);
  return endpoints;
}

type RuntimeInspectionSnapshot = {
  readonly opened: OpenedRuntimeConfig;
  readonly document: LocalRuntimeProfile;
  readonly hostStateRoot: string;
  readonly registry: RuntimeAdapterRegistry;
  readonly activations: readonly {
    readonly entry: LocalRuntimeAdapterSelection;
    readonly activation: RuntimeEndpointActivation;
  }[];
  readonly endpoints: EndpointRegistry;
};

async function openRuntimeInspectionSnapshot(
  path: string,
  queries: readonly RuntimeHostEndpointQuery[],
  options: LoadRuntimeConfigOptions,
): Promise<RuntimeInspectionSnapshot> {
  const opened = await openRuntimeConfig(path, options.packageRoot);
  const document = scopedProfile(opened.document, {
    capabilities: queries.map((query) => query.capability),
  });
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(
    registry,
    opened.packageRoot,
    endpointAdapterSelection(document),
    options.distributionPackageRoot,
  );
  const activations = await activatedEndpoints(document, opened.root, hostStateRoot, registry);
  return {
    opened,
    document,
    hostStateRoot,
    registry,
    activations,
    endpoints: await installedEndpointRegistry(document, activations),
  };
}

type TransientResourceClaim = EndpointScheduling["resources"][number];

/** In-memory concurrency shared only by evaluations inside one disposable authoring session. */
class TransientSessionCapacity {
  readonly #limits = new Map<string, number>();
  readonly #active = new Map<string, number>();
  readonly #waiters = new Set<() => void>();

  declare(resources: readonly TransientResourceClaim[]): void {
    for (const resource of resources) {
      capacityUnits(resource);
      const previous = this.#limits.get(resource.id);
      if (previous !== undefined && previous !== resource.limit) {
        throw new Error(`Transient Runtime resource ${resource.id} has conflicting limits ${previous} and ${resource.limit}`);
      }
      this.#limits.set(resource.id, resource.limit);
    }
  }

  async run<T>(resources: readonly TransientResourceClaim[], task: () => Promise<T>): Promise<T> {
    const ordered = [...resources].sort((left, right) => compareCodeUnits(left.id, right.id));
    for (const resource of ordered) capacityUnits(resource);
    while (ordered.some((resource) => (this.#active.get(resource.id) ?? 0) + capacityUnits(resource) > resource.limit)) {
      await new Promise<void>((resolveWait) => this.#waiters.add(resolveWait));
    }
    for (const resource of ordered) this.#active.set(resource.id, (this.#active.get(resource.id) ?? 0) + capacityUnits(resource));
    try {
      return await task();
    } finally {
      for (const resource of ordered) {
        const next = (this.#active.get(resource.id) ?? capacityUnits(resource)) - capacityUnits(resource);
        if (next === 0) this.#active.delete(resource.id);
        else this.#active.set(resource.id, next);
      }
      const waiters = [...this.#waiters];
      this.#waiters.clear();
      for (const wake of waiters) wake();
    }
  }
}

/**
 * Open the Profile's disposable authoring execution. Endpoint Providers opt individual immediate
 * capabilities into this boundary; price and process location are deliberately irrelevant.
 */
export async function openTransientRuntimeConfigExecution(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeHostTransientExecution> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document), options.distributionPackageRoot);
  const endpoints = new EndpointRegistry();
  const capacity = new TransientSessionCapacity();
  const activations = await activatedEndpoints(document, root, hostStateRoot, registry);
  for (const { activation } of activations) {
    let readiness: Promise<void> | undefined;
    const assertReady = async (): Promise<void> => {
      const program = activation.program;
      if (program === undefined) return;
      readiness ??= program.probe().then((state) => {
        if (state.state !== "ready") {
          throw new Error(`Runtime program ${program.id} is ${state.state}: ${state.detail}`);
        }
      });
      try {
        await readiness;
      } catch (error) {
        readiness = undefined;
        throw error;
      }
    };
    const transientOnly: EndpointRegistrar = {
      registerImmediateEndpoint(id, capability, returns, handler, registrationOptions) {
        if (registrationOptions?.transient !== true) return;
        const resources = registrationOptions.scheduling?.resources ?? [{ id: `endpoint:${id}`, limit: 1 }];
        capacity.declare(resources);
        endpoints.registerImmediateEndpoint(id, capability, returns, async (context) => {
          const claims = registrationOptions.scheduling === undefined ? resources
            : endpointResourceClaims(registrationOptions.scheduling, context.need);
          return await capacity.run(claims, async () => {
            await assertReady();
            return await handler(context);
          });
        }, registrationOptions);
      },
      registerAsyncEndpoint(id, capability, _returns, _endpoint, registrationOptions) {
        if (registrationOptions?.transient === true) {
          throw new Error(`Endpoint ${id} declares asynchronous capability ${capabilityKey(capability)} as transient`);
        }
      },
    };
    await installEndpoint(activation.endpoint, transientOnly);
  }
  applyEndpointBindings(endpoints, document.bindings);
  const stores = await openCredentialStores(document, root, hostStateRoot, registry);
  let closed = false;
  let activeEvaluations = 0;
  let closing: Promise<void> | undefined;
  const idleWaiters = new Set<() => void>();
  return {
    async evaluate(input) {
      if (closed) throw new Error("transient Runtime execution is closed");
      activeEvaluations += 1;
      try {
        const executor = new Executor({
          producers: input.producers,
          refinements: input.refinements,
          endpoints,
          resources: input.resources,
          credentials: stores.store,
        });
        const [result] = await new InProcessBuildScheduler(executor).run([{
          id: "transient",
          definition: {
            format: "hypit.build-definition@1",
            program: input.state.program,
            plan: input.state.plan,
          },
          facts: [],
        }]);
        if (result === undefined) throw new Error("transient execution produced no result");
        return result;
      } finally {
        activeEvaluations -= 1;
        if (activeEvaluations === 0) {
          const waiters = [...idleWaiters];
          idleWaiters.clear();
          for (const wake of waiters) wake();
        }
      }
    },
    async close() {
      if (closing !== undefined) return await closing;
      closed = true;
      closing = (async () => {
        if (activeEvaluations > 0) {
          await new Promise<void>((resolveWait) => idleWaiters.add(resolveWait));
        }
        await stores.close();
      })();
      await closing;
    },
  };
}

type InspectionEndpointSelection = {
  readonly query: RuntimeHostEndpointQuery;
  readonly observation: RuntimeHostEndpointObservation;
  readonly activation?: RuntimeInspectionSnapshot["activations"][number];
};

/** Resolve static Endpoint selection once per frozen inspection session. */
function resolveInspectionEndpoints(
  snapshot: RuntimeInspectionSnapshot,
  queries: readonly RuntimeHostEndpointQuery[],
): readonly InspectionEndpointSelection[] {
  const { document, activations, endpoints } = snapshot;
  return queries.map((query): InspectionEndpointSelection => {
    const base = {
      need: query.need,
      capability: structuredClone(query.capability),
    };
    const binding = document.bindings[capabilityKey(query.capability)];
    const bound = binding === undefined ? {} : { binding };
    const selection = endpoints.select(query);
    if (selection.status === "missing") {
      return { query, observation: { ...base, status: "unresolved", support: "not-evaluated", ...bound } };
    }
    if (selection.status === "ambiguous") {
      return {
        query,
        observation: {
          ...base,
          status: "ambiguous",
          support: "not-evaluated",
          endpoints: selection.endpointIds,
          ...bound,
        },
      };
    }
    const match = activations.find(({ activation }) => activation.endpoint.instance.id === selection.registration.id);
    const pricing = match?.activation.endpoint.pricing;
    const support = query.kind === "concrete"
      ? endpoints.checkSupport(selection.registration, query)
      : { status: "not-evaluated" as const };
    const selected = {
      ...base,
      status: "resolved" as const,
      endpoint: selection.registration.id,
      ...(match === undefined ? {} : { use: match.entry.use }),
      ...(pricing === undefined ? {} : { pricing: structuredClone(pricing) }),
      ...bound,
    };
    const observation: RuntimeHostEndpointObservation = support.status === "unsupported" ? {
      ...selected,
      support: "unsupported",
      rejections: [{ endpoint: selection.registration.id, message: support.reason }],
    } : { ...selected, support: support.status };
    return {
      query,
      observation,
      ...(match === undefined ? {} : { activation: match }),
    };
  });
}

export async function describeRuntimeConfigEndpoints(
  path: string,
  queries: readonly RuntimeHostEndpointQuery[],
  options: LoadRuntimeConfigOptions = {},
): Promise<readonly RuntimeHostEndpointObservation[]> {
  if (queries.length === 0) return [];
  const inspection = await openRuntimeConfigInspection(path, queries, options);
  try {
    return await inspection.endpoints();
  } finally {
    await inspection.close();
  }
}

async function resolveEndpointCredentials(
  endpoint: EndpointInstance,
  store: CredentialStore,
  profile: string,
): Promise<Readonly<Record<string, EndpointCredential>>> {
  const credentials: Record<string, EndpointCredential> = {};
  for (const slot of endpoint.credentials) {
    const value = await store.resolve(slot.ref);
    if (value === undefined) {
      throw new Error(`${slot.label} for Endpoint ${slot.endpoint} is not configured. ${
        slot.ref.store === "env"
          ? `Set ${slot.ref.key} in this process environment.`
          : `Configure it with: hypit auth login ${slot.endpoint} --runtime ${profile}`}`);
    }
    const writable = await writableCredentialStore(store, slot.ref);
    Object.defineProperty(credentials, slot.slot, {
      value: {
        ...value,
        ...(writable === undefined ? {} : {
          replace: async (replacement: CredentialValue) => await writable.put(slot.ref, replacement),
        }),
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return credentials;
}

type InspectionCredentialStores = Map<string, Awaited<ReturnType<typeof openCredentialStores>>>;

async function readInspectionPricing(
  snapshot: RuntimeInspectionSnapshot,
  selections: readonly InspectionEndpointSelection[],
  options: LoadRuntimeConfigOptions,
  stores: InspectionCredentialStores,
): Promise<readonly RuntimeHostEndpointPricing[]> {
  const { opened, document, hostStateRoot, registry } = snapshot;
  const { absolute, root, packageRoot } = opened;
  const openedStores = async (endpoint: EndpointInstance) => {
    let opened = stores.get(endpoint.instance.id);
    if (opened === undefined) {
      const selected = credentialProfile(document, [endpoint]);
      await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection({ ...selected, endpoints: [] }), options.distributionPackageRoot);
      opened = await openCredentialStores(selected, root, hostStateRoot, registry);
      stores.set(endpoint.instance.id, opened);
    }
    return opened;
  };
  const result: RuntimeHostEndpointPricing[] = [];
  for (const selection of selections) {
    const request = selection.query;
    const selected: RuntimeHostEndpointPricing = selection.observation;
    const endpoint = selection.activation?.activation.endpoint;
    if (request.kind !== "concrete" || selected.support === "unsupported"
      || selected.status !== "resolved" || selected.pricing?.kind === "local"
      || endpoint?.readPricing === undefined) {
      result.push(selected);
      continue;
    }
    const endpointRequest = {
      capability: request.capability,
      returns: request.returns,
      constraints: request.constraints,
    };
    try {
      const pricingDocuments = await endpoint.readPricing({
        request: endpointRequest,
        credentials: async () => {
          const opened = await openedStores(endpoint);
          return await resolveEndpointCredentials(endpoint, opened.store, absolute);
        },
      });
      pricingDocuments.forEach(verifyEndpointPricingDocument);
      result.push({
        ...selected,
        ...(pricingDocuments.length === 0 ? {} : {
          pricingDocuments: structuredClone(pricingDocuments),
        }),
      });
    } catch (error) {
      result.push({
        ...selected,
        pricingError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

/** Read current Provider-owned pricing material; no Build, generation or durable pricing cache is created. */
export async function readRuntimeConfigPricing(
  path: string,
  queries: readonly RuntimeHostEndpointQuery[],
  options: LoadRuntimeConfigOptions = {},
): Promise<readonly RuntimeHostEndpointPricing[]> {
  if (queries.length === 0) return [];
  const inspection = await openRuntimeConfigInspection(path, queries, options);
  try {
    return await inspection.pricing();
  } finally {
    await inspection.close();
  }
}

/**
 * Freeze one Profile and its activated Endpoint declarations for a single caller command.
 * Pricing credentials remain lazy and are released with the session; nothing is persisted.
 */
export async function openRuntimeConfigInspection(
  path: string,
  queries: readonly RuntimeHostEndpointQuery[],
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfigInspection> {
  const snapshot = await openRuntimeInspectionSnapshot(path, queries, options);
  const selections = resolveInspectionEndpoints(snapshot, queries);
  const stores: InspectionCredentialStores = new Map();
  let closed = false;
  let endpointResult: readonly RuntimeHostEndpointObservation[] | undefined;
  let pricingResult: Promise<readonly RuntimeHostEndpointPricing[]> | undefined;
  let preflightResult: Promise<RuntimeConfigDoctorResult> | undefined;
  let runtimeResult: Promise<LocalRuntime> | undefined;
  const assertOpen = (): void => {
    if (closed) throw new Error("Runtime inspection is closed");
  };
  const endpoints = (): readonly RuntimeHostEndpointObservation[] => {
    assertOpen();
    endpointResult ??= selections.map((item) => item.observation);
    return endpointResult;
  };
  const selectedEndpoints = (): readonly string[] => [...new Set(endpoints().flatMap((item) =>
    item.status === "resolved" && item.endpoint !== undefined ? [item.endpoint] : []))];
  return {
    dataRoot: snapshot.opened.root,
    endpoints: async () => endpoints(),
    pricing: async () => {
      assertOpen();
      pricingResult ??= readInspectionPricing(snapshot, selections, options, stores);
      return await pricingResult;
    },
    preflight: async () => {
      assertOpen();
      preflightResult ??= inspectOpenedRuntimeConfig(snapshot.opened, {
        ...options,
        registry: snapshot.registry,
        endpoints: selectedEndpoints(),
        active: false,
      }, snapshot);
      return await preflightResult;
    },
    createRuntime: async () => {
      assertOpen();
      runtimeResult ??= createRuntimeFromOpened(snapshot.opened, {
        ...options,
        registry: snapshot.registry,
        endpoints: selectedEndpoints(),
      }, undefined, snapshot.activations);
      return await runtimeResult;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await Promise.all([...stores.values()].map((opened) => opened.close()));
      stores.clear();
    },
  };
}

/**
 * Execute one immediate Need through the selected Profile, outside any Build.
 *
 * This is the creation-time boundary: the same Endpoint activation, capability resolution and
 * credential resolution a Build uses, with no Build id, Worker, Result or stored state. The caller
 * owns the ResourceStore, so whatever the Endpoint reads or returns stays in the caller's hands.
 * Asynchronous capabilities are refused: slow paid generation goes through a Build.
 */
export async function invokeRuntimeConfigNeed(
  path: string,
  need: Need,
  resources: ResourceStore,
  options: LoadRuntimeConfigOptions & RuntimeInvocationObservation = {},
): Promise<Value> {
  const opened = await openRuntimeConfig(path, options.packageRoot);
  const { absolute, root, packageRoot } = opened;
  const document = scopedProfile(opened.document, { capabilities: [need.capability] });
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, endpointAdapterSelection(document), options.distributionPackageRoot);
  const activations = await activatedEndpoints(document, root, hostStateRoot, registry);
  const endpoints = await installedEndpointRegistry(document, activations);
  const subject = capabilityKey(need.capability);
  const selection = endpoints.select(need);
  if (selection.status === "missing") {
    throw new Error(selection.endpointId === undefined
      ? `No Endpoint in ${absolute} serves ${subject}; hypit plan --runtime ${absolute} shows which Endpoint each capability needs`
      : `${absolute} binds ${subject} to ${selection.endpointId}, which does not offer this demand; change that binding`);
  }
  if (selection.status === "ambiguous") {
    throw new Error(`Several Endpoints in ${absolute} serve ${subject}: ${selection.endpointIds.join(", ")}. `
      + `Say which one does it: add "bindings": { "${subject}": "<instance>" } to the Profile`);
  }
  const registration = selection.registration;
  const support = endpoints.checkSupport(registration, need);
  if (support.status === "unsupported") {
    throw new Error(`${registration.id} rejected ${subject}: ${support.reason}`);
  }
  if (registration.kind !== "immediate") {
    throw new Error(`${subject} is an asynchronous capability; creation-time calls only use immediate capabilities, submit a Build for it`);
  }
  const activation = activations.find(({ activation: item }) => item.endpoint.instance.id === registration.id)?.activation;
  if (activation === undefined) throw new Error(`Endpoint ${registration.id} is not declared by ${absolute}`);
  const selected = credentialProfile(document, [activation.endpoint]);
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection({ ...selected, endpoints: [] }), options.distributionPackageRoot);
  const stores = await openCredentialStores(selected, root, hostStateRoot, registry);
  try {
    const credentials = await resolveEndpointCredentials(activation.endpoint, stores.store, absolute);
    return await registration.handler({
      need,
      resources,
      credentials,
      ...(options.reportProgress === undefined ? {} : { reportProgress: options.reportProgress }),
      ...(options.reportDiagnostic === undefined ? {} : { reportDiagnostic: options.reportDiagnostic }),
    });
  } finally {
    await stores.close();
  }
}

function diagnostic(error: unknown, code: string, subject?: string): RuntimeDoctorDiagnostic {
  return {
    severity: "error",
    code,
    message: error instanceof Error ? error.message : String(error),
    ...(subject === undefined ? {} : { subject }),
  };
}

async function openCredentialStores(
  document: LocalRuntimeProfile,
  root: string,
  hostStateRoot: string,
  registry: RuntimeAdapterRegistry,
): Promise<{ readonly store: CredentialStore; close(): Promise<void> }> {
  const opened: RuntimeOpened<CredentialStore>[] = [];
  try {
    for (const item of document.credentials) {
      opened.push(await registry.openCredentialStore(item.use, adapterContext(root, hostStateRoot, item)));
    }
    return {
      store: new CompositeCredentialStore(opened.map((item) => item.value)),
      close: async () => {
        for (const item of [...opened].reverse()) await item.close?.();
      },
    };
  } catch (error) {
    for (const item of [...opened].reverse()) await item.close?.();
    throw error;
  }
}

export function statePath(root: string): string {
  return resolve(root, "runtime.sqlite");
}

function buildWorkPath(root: string, build: string): string {
  assertBuildId(build);
  const work = resolve(root, "work");
  const target = resolve(work, build);
  const relation = relative(work, target);
  if (relation.length === 0 || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`Build ${build} leaves Runtime work root ${work}`);
  }
  return target;
}

async function inspectOpenedRuntimeConfig(
  opened: OpenedRuntimeConfig,
  options: RuntimeInspectionOptions,
  prepared?: Pick<RuntimeInspectionSnapshot, "registry" | "activations">,
): Promise<RuntimeConfigDoctorResult> {
  const { absolute, root, packageRoot } = opened;
  const document = scopedProfile(opened.document, options);
  const scoped = options.endpoints !== undefined || options.capabilities !== undefined;
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const diagnostics: RuntimeDoctorDiagnostic[] = [];
  try {
    if (!(await stat(root)).isDirectory()) throw new Error(`Runtime root ${root} is not a directory`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return { dataRoot: root, diagnostics: [diagnostic(error, "RUNTIME_DATA_ROOT_INVALID", root)] };
    }
  }
  const registry = prepared?.registry ?? options.registry ?? new RuntimeAdapterRegistry();
  if (prepared === undefined) {
    try {
      await installRuntimeAdapters(registry, packageRoot, endpointAdapterSelection(document), options.distributionPackageRoot);
    } catch (error) {
      return { dataRoot: root, diagnostics: [diagnostic(error, "RUNTIME_PACKAGE_SELECTION_INVALID")] };
    }
  }
  const requested = options.capabilities === undefined
    ? undefined
    : new Set(options.capabilities.map(capabilityKey));
  const covered = new Set<string>();
  const activated: Array<{ readonly item: LocalRuntimeAdapterSelection; readonly activation: RuntimeEndpointActivation }> = [];
  const selectedEndpoints: Array<{ readonly item: LocalRuntimeAdapterSelection; readonly activation: RuntimeEndpointActivation }> = [];
  const preparedActivations = new Map(prepared?.activations.map((item) => [item.entry.instance, item.activation]));
  for (const item of document.endpoints) {
    let activation: RuntimeEndpointActivation;
    try {
      const existing = preparedActivations.get(item.instance);
      if (prepared !== undefined && existing === undefined) {
        throw new Error(`Runtime inspection has no activated Endpoint ${item.instance}`);
      }
      activation = existing ?? await registry.activateEndpoint(
        item.use,
        adapterContext(root, hostStateRoot, { ...item, pool: item.pool ?? item.instance }),
      );
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ENDPOINT_CONFIG_INVALID", item.instance));
      continue;
    }
    activated.push({ item, activation });
    if (requested !== undefined && !endpointOffers(activation.endpoint).some((offer) => requestsCapability(document, item.instance, offer.capability, requested))) continue;
    for (const offer of endpointOffers(activation.endpoint)) covered.add(capabilityKey(offer.capability));
    selectedEndpoints.push({ item, activation });
    const program = activation.program;
    if (program === undefined) continue;
    let state: ManagedProgramState;
    try {
      state = await program.probe();
    } catch (error) {
      diagnostics.push(diagnostic(error, "MANAGED_PROGRAM_PROBE_FAILED", program.id));
      continue;
    }
    if (state.state !== "ready") {
      diagnostics.push({
        severity: "error",
        code: state.state === "down" ? "MANAGED_PROGRAM_DOWN" : "MANAGED_PROGRAM_MISMATCH",
        message: `${program.id} is not usable: ${state.detail}`,
        subject: program.id,
      });
    }
  }
  for (const capability of options.capabilities ?? []) {
    if (!covered.has(capabilityKey(capability))) diagnostics.push({
      severity: "error",
      code: "RUNTIME_CAPABILITY_UNBOUND",
      message: `No usable Endpoint in this Runtime Profile fulfills ${capabilityKey(capability)}`,
      subject: capabilityKey(capability),
    });
  }
  // Who serves a capability that several selected Endpoints offer is the Profile's decision. An
  // unbound contest is an error for a demanded capability and a warning otherwise; a binding to an
  // Endpoint that does not offer the capability is always an error.
  try {
    const endpoints = await installedEndpointRegistry(document, activated.map(({ item, activation }) => ({ entry: item, activation })));
    for (const [key, instance] of Object.entries(document.bindings)) {
      const offered = activated.some(({ item, activation }) =>
        item.instance === instance && endpointOffers(activation.endpoint).some((offer) => capabilityKey(offer.capability) === key));
      if (!offered && activated.some(({ item }) => item.instance === instance)) diagnostics.push({
        severity: "error",
        code: "RUNTIME_BINDING_INVALID",
        message: `bindings names ${instance} for ${key}, but that Endpoint does not offer it`,
        subject: key,
      });
    }
    for (const conflict of endpoints.capacityConflicts()) {
      diagnostics.push({
        severity: "error",
        code: "RUNTIME_POOL_CONFLICT",
        message: `${conflict.endpointIds.join(", ")} share ${conflict.resource} but size it ${conflict.settings.join(" and ")}; use the same limit and period for this shared resource or different pools`,
        subject: conflict.resource,
      });
    }
    for (const contest of endpoints.contested()) {
      if (contest.bound !== undefined) continue;
      const key = capabilityKey(contest.capability);
      diagnostics.push({
        severity: requested !== undefined && requested.has(key) ? "error" : "warning",
        code: "RUNTIME_CAPABILITY_AMBIGUOUS",
        message: `${contest.endpointIds.join(", ")} all offer ${key}. Say which one does it: add "bindings": { "${key}": "<instance>" } to the Profile`,
        subject: key,
      });
    }
  } catch (error) {
    diagnostics.push(diagnostic(error, "RUNTIME_ENDPOINT_INSTALL_FAILED"));
  }
  const credentialDocument = scoped ? credentialProfile(document, selectedEndpoints.map(({ activation }) => activation.endpoint)) : document;
  try {
    await installRuntimeAdapters(registry, packageRoot, {
      selected: [], logical: credentialDocument.credentials.map((item) => ({ abi: runtimeCredentialStoreAdapterFacetAbi, name: item.use })),
    }, options.distributionPackageRoot);
  const storeSelections = [
    ...credentialDocument.credentials.map((item) => ({ item, kind: "credential-store" as const })),
  ];
  for (const selection of storeSelections) {
    const context = adapterContext(root, hostStateRoot, selection.item);
    try {
      diagnostics.push(...registry.validate(selection.item.use, selection.kind, context));
      if (options.active) {
        diagnostics.push(...await registry.doctor(selection.item.use, selection.kind, context));
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_COMPONENT_CONFIG_INVALID", selection.item.instance));
    }
  }
  } catch (error) {
    diagnostics.push(diagnostic(error, "RUNTIME_CREDENTIAL_CHECK_FAILED"));
  }
  if (selectedEndpoints.length > 0) {
    let stores: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
    try {
      stores = await openCredentialStores(credentialDocument, root, hostStateRoot, registry);
      for (const { item, activation } of selectedEndpoints) {
        const credentials: Record<string, CredentialValue> = {};
        let missing = false;
        for (const slot of activation.endpoint.credentials) {
          const value = await stores.store.resolve(slot.ref);
          if (value !== undefined) {
            Object.defineProperty(credentials, slot.slot, {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
            continue;
          }
          missing = true;
          diagnostics.push({
            severity: "error",
            code: "RUNTIME_CREDENTIAL_MISSING",
            message: `${slot.label} for Endpoint ${slot.endpoint} is not configured. ${
              slot.ref.store === "env"
                ? `Set ${slot.ref.key} in this process environment.`
                : `Configure it with: hypit auth login ${slot.endpoint} --runtime ${absolute}`}`,
            subject: `${slot.endpoint}.${slot.slot}`,
          });
        }
        if (!options.active || missing || activation.diagnose === undefined) continue;
        try {
          const offers = endpointOffers(activation.endpoint);
          const capabilities = (options.capabilities ?? offers.map((offer) => offer.capability))
            .filter((capability) => offers
              .some((offer) => capabilityKey(offer.capability) === capabilityKey(capability)));
          diagnostics.push(...await activation.diagnose({
            credentials,
            capabilities,
          }));
        } catch (error) {
          diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_CREDENTIAL_CHECK_FAILED"));
    } finally {
      await stores?.close();
    }
  }
  return { dataRoot: root, diagnostics };
}

async function inspectRuntimeConfig(
  path: string,
  options: RuntimeInspectionOptions,
): Promise<RuntimeConfigDoctorResult> {
  return await inspectOpenedRuntimeConfig(await openRuntimeConfig(path, options.packageRoot), options);
}

/**
 * Cheap Build preflight. This intentionally stops at local configuration,
 * package, credential, executable and Managed Program readiness. Remote
 * connectivity belongs to doctor, and installation belongs to runtime up.
 */
export async function preflightRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[]; readonly endpoints?: readonly string[] } = {},
): Promise<RuntimeConfigDoctorResult> {
  return await inspectRuntimeConfig(path, { ...options, active: false });
}

/** Active diagnosis may ask selected credentials and Endpoints to verify their configured services. */
export async function doctorRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[]; readonly endpoints?: readonly string[] } = {},
): Promise<RuntimeConfigDoctorResult> {
  return await inspectRuntimeConfig(path, { ...options, active: true });
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  return await createRuntimeFromOpened(await openRuntimeConfig(path, options.packageRoot), options);
}

/** Execution choices are captured at submission; later Profile edits belong to later Builds. */
export type LocalExecutionContext = {
  readonly format: "hypit.local-execution@1";
  readonly packageRoot: string;
  readonly hostStateRoot: string;
  readonly distributionPackageRoot?: string;
  readonly profile: CanonicalValue;
};

export function localExecutionContext(value: CanonicalValue | undefined): LocalExecutionContext {
  const record = object(value, "Build execution context");
  if (record.format !== "hypit.local-execution@1") throw new Error("Build has no local execution context; create a new Build");
  return {
    format: "hypit.local-execution@1",
    packageRoot: requiredString(record.packageRoot, "execution.packageRoot"),
    hostStateRoot: requiredString(record.hostStateRoot, "execution.hostStateRoot"),
    ...(record.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: requiredString(record.distributionPackageRoot, "execution.distributionPackageRoot") }),
    profile: record.profile as CanonicalValue,
  };
}

export async function createRuntimeForBuild(dataRoot: string, build: string, execution: {
  readonly state: SqliteRuntimeState;
  readonly importModule: (url: string) => Promise<unknown>;
}): Promise<LocalRuntime> {
  const context = localExecutionContext((await execution.state.execution.read(build))?.context);
  return await createRuntimeFromOpened({
    absolute: dataRoot, profileRoot: dataRoot, root: dataRoot,
    packageRoot: context.packageRoot, document: parseLocalRuntimeProfile(context.profile),
  }, { ...context, importModule: execution.importModule }, { state: execution.state, build });
}

async function createRuntimeFromOpened(opened: OpenedRuntimeConfig, options: LoadRuntimeConfigOptions, execution?: {
  readonly state: SqliteRuntimeState; readonly build: string;
}, preparedActivations?: readonly RuntimeInspectionSnapshot["activations"][number][]): Promise<LocalRuntime> {
  const { root, packageRoot } = opened;
  let document = scopedProfile(opened.document, options);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, endpointAdapterSelection(document), options.distributionPackageRoot, options.importModule);
  const state = execution?.state ?? new SqliteRuntimeState(statePath(root));
  let credentials: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
  try {
    const prepared = new Map(preparedActivations?.map((item) => [item.entry.instance, item.activation.endpoint]));
    const endpoints = await Promise.all(document.endpoints.map(async (item) => {
      if (preparedActivations !== undefined) {
        const endpoint = prepared.get(item.instance);
        if (endpoint === undefined) throw new Error(`Runtime inspection has no activated Endpoint ${item.instance}`);
        return endpoint;
      }
      return await registry.createEndpoint(
        item.use,
        adapterContext(root, hostStateRoot, { ...item, pool: item.pool ?? item.instance }),
      );
    }));
    document = credentialProfile(document, endpoints);
    await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection({ ...document, endpoints: [] }), options.distributionPackageRoot, options.importModule);
    credentials = await openCredentialStores(document, root, hostStateRoot, registry);
    const selections = (items: readonly LocalRuntimeAdapterSelection[]) => Object.fromEntries(items.map(({ instance, ...selection }) => [instance, selection]));
    const context = {
      format: "hypit.local-execution@1", packageRoot, hostStateRoot,
      ...(options.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: options.distributionPackageRoot }),
      profile: { format: document.format, dataRoot: root, credentials: selections(document.credentials),
        endpoints: selections(document.endpoints), bindings: document.bindings },
    } as CanonicalValue;
    return await createLocalRuntime({
      ...(execution === undefined ? {} : { executionBuild: execution.build }),
      executionContext: context,
      buildStore: state.builds,
      buildCatalog: state.catalog,
      operationStore: state.operations,
      commandExecutionStore: state.commandExecutions,
      executionLogs: fileExecutionLogs((build) => buildWorkPath(root, build)),
      executionStore: state.execution,
      removeActiveBuild: async (build) => await state.removeActiveBuild(build),
      submissionStore: state.submissions,
      resourceStore: new FileResourceStore(resolve(root, "resources")),
      resourceStoreForBuild: (build) => new FileResourceStore(buildWorkPath(root, build)),
      clearBuildResources: async (build) => {
        await rm(buildWorkPath(root, build), { recursive: true, force: true });
      },
      openBuildResultRepository: openBuildResultLocation,
      credentialStore: credentials.store,
      loadProducerPackages: async (specifiers) => {
        const loaded = await loadNodePackageSelection(specifiers, packageRoot, {
          ...(options.importModule === undefined ? {} : { importModule: options.importModule }),
          ...(options.distributionPackageRoot === undefined
            ? {}
            : { fallbackRoots: [options.distributionPackageRoot] }),
        });
        return loaded;
      },
      endpoints,
      bindings: document.bindings,
      close: async () => {
        await credentials?.close();
        if (execution === undefined) state.close();
      },
    });
  } catch (error) {
    await credentials?.close();
    if (execution === undefined) state.close();
    throw error;
  }
}

export async function createRuntimeControlFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly readOnly?: boolean } = {},
): Promise<LocalRuntimeControl> {
  const { root } = await openRuntimeConfig(path, options.packageRoot);
  const state = new SqliteRuntimeState(statePath(root), { readOnly: options.readOnly === true });
  return createLocalRuntimeControl({
    buildStore: state.builds,
    commandExecutionStore: state.commandExecutions,
    executionLogs: fileExecutionLogs((build) => buildWorkPath(root, build)),
    buildCatalog: state.catalog,
    operationStore: state.operations,
    executionStore: state.execution,
    submissionStore: state.submissions,
    close: () => state.close(),
  });
}

export async function createRuntimeResultControlFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalResultWriter> {
  const { root } = await openRuntimeConfig(path, options.packageRoot);
  return createRuntimeResultWriter(root);
}

export function createRuntimeResultWriter(root: string): LocalResultWriter {
  const state = new SqliteRuntimeState(statePath(root));
  return createLocalResultWriter({
    buildStore: state.builds,
    operationStore: state.operations,
    commandExecutionStore: state.commandExecutions,
    executionLogs: fileExecutionLogs((build) => buildWorkPath(root, build)),
    executionStore: state.execution,
    removeActiveBuild: async (build) => await state.removeActiveBuild(build),
    submissionStore: state.submissions,
    resourceStore: new FileResourceStore(resolve(root, "resources")),
    resourceStoreForBuild: (build) => new FileResourceStore(buildWorkPath(root, build)),
    clearBuildResources: async (build) => {
      await rm(buildWorkPath(root, build), { recursive: true, force: true });
    },
    openBuildResultRepository: openBuildResultLocation,
    close: () => state.close(),
  });
}

export async function createRuntimeCredentialsFromConfig(
  path: string,
  endpointInstance: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalCredentialControl> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
  const endpoint = document.endpoints.find((item) => item.instance === endpointInstance);
  if (endpoint === undefined) throw new Error(`Runtime Profile has no Endpoint instance ${endpointInstance}`);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document), options.distributionPackageRoot);
  const credentials = await openCredentialStores(document, root, hostStateRoot, registry);
  try {
    const endpointInstance = await registry.createEndpoint(endpoint.use, adapterContext(root, hostStateRoot, {
      ...endpoint,
      pool: endpoint.pool ?? endpoint.instance,
    }));
    return createLocalCredentialControl({
      credentialStore: credentials.store,
      endpoints: [endpointInstance],
      close: credentials.close,
    });
  } catch (error) {
    await credentials.close();
    throw error;
  }
}
