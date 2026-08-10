import { resolve } from "node:path";

import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@narratage/component-kit";
import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
} from "@narratage/driver-node";
import {
  loadNodePackageSet,
  collectNodePackageComponents,
} from "@narratage/package-loader-node";
import { isDigest } from "@narratage/protocol";
import {
  RuntimeModuleRegistry,
  createBuildDispatchIdentity,
  isEnumerableBuildStore,
  isManagedArtifactStore,
  isStreamingArtifactStore,
  resolveRuntimeProfile,
  sealRuntimeProfile,
  writableCredentialStore,
} from "@narratage/runtime";
import { TypeValidatorRegistry } from "@narratage/validation";
import type {
  RuntimeModuleManifest,
  RuntimeProfileInstance,
} from "@narratage/runtime";

import { createProjectRuntimeServices } from "./project-services.js";
import type {
  CreateLocalRuntimeOptions,
  LocalBuildOptions,
  LocalBuildRequest,
  LocalBuildSubmission,
  LocalRuntime,
  EndpointPackage,
  ProjectLocalRuntimeOptions,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function moduleKey(manifest: RuntimeModuleManifest): string {
  return `${manifest.name}@${manifest.version}`;
}

function facetKey(instance: RuntimeProfileInstance): string {
  return `${instance.facet.module.name}@${instance.facet.module.version}#${instance.facet.name}`;
}

function manifestDigest(manifest: RuntimeModuleManifest): string {
  const registry = new RuntimeModuleRegistry();
  return registry.register(manifest);
}

function nonNegativeInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value >= 0, `${subject} must be a non-negative safe integer`);
  return value;
}

function collectArtifactDigests(
  value: unknown,
  digests: Set<import("@narratage/protocol").Digest>,
  seen = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    if (item.kind === "blob" && typeof item.digest === "string" && isDigest(item.digest)) {
      digests.add(item.digest);
    }
  }
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    collectArtifactDigests(nested, digests, seen);
  }
}

async function wait(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted === true) throw signal.reason ?? new Error("Local Runtime follow was aborted");
  await new Promise<void>((resolveWait, reject) => {
    const done = (): void => {
      signal?.removeEventListener("abort", abort);
      resolveWait();
    };
    const timer = setTimeout(done, delayMs);
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new Error("Local Runtime follow was aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function registerManifests(
  registry: RuntimeModuleRegistry,
  manifests: readonly RuntimeModuleManifest[],
): void {
  const seen = new Map<string, string>();
  for (const manifest of manifests) {
    const key = moduleKey(manifest);
    const digest = manifestDigest(manifest);
    const existing = seen.get(key);
    if (existing !== undefined) {
      assert(existing === digest, `Runtime package ${key} was configured with conflicting Manifests`);
      continue;
    }
    seen.set(key, digest);
    registry.register(manifest);
  }
}

function verifyEndpointPackages(packages: readonly EndpointPackage[]): void {
  const names = new Set<string>();
  const instances = new Set<string>();
  for (const item of packages) {
    assert(item.name.trim().length > 0, "Endpoint package name must not be empty");
    assert(!names.has(item.name), `Endpoint package ${item.name} is configured twice`);
    names.add(item.name);
    assert(item.instance.id.trim().length > 0, `${item.name} Endpoint instance id is empty`);
    assert(!instances.has(item.instance.id), `Endpoint instance ${item.instance.id} is configured twice`);
    instances.add(item.instance.id);
    assert(item.manifest.name === item.instance.facet.module.name
      && item.manifest.version === item.instance.facet.module.version,
    `${item.name} instance ${facetKey(item.instance)} is outside its Runtime Manifest`);
    assert(item.bindings.length > 0, `${item.name} binds no exact capability`);
    for (const binding of item.bindings) {
      assert(binding.endpoint === item.instance.id,
        `${item.name} binding points to ${binding.endpoint}, not ${item.instance.id}`);
    }
  }
}

export async function createLocalRuntime(
  options: CreateLocalRuntimeOptions,
): Promise<LocalRuntime> {
  const buildCatalog = options.buildCatalog;
  if (options.scheduling?.maxConcurrency !== undefined || options.scheduling?.laneLimits !== undefined) {
    throw new Error("a locked Runtime Closure owns maxConcurrency and lane limits");
  }
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  const validators = options.validators ?? new TypeValidatorRegistry();
  const componentNames = new Set<string>();
  for (const component of options.components ?? []) {
    assert(component.name.trim().length > 0, "Component package name must not be empty");
    assert(!componentNames.has(component.name), `Component package ${component.name} is configured twice`);
    componentNames.add(component.name);
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(producers, component.producers ?? []);
  }
  for (const endpoint of options.endpoints ?? []) await endpoint.install(endpoints);
  endpoints.applyRuntimeClosure(
    options.closure.value,
    options.closure.modules,
    { allowedPermissions: options.closure.allowedPermissions ?? [] },
  );
  const driver = new NodeDriver({
    producers,
    endpoints,
    artifacts: options.artifactStore,
    credentials: options.credentialStore,
    operations: options.operationStore,
    validators,
    ...(options.implementationClosure === undefined
      ? {}
      : { implementationClosure: options.implementationClosure }),
  });
  const scheduling = {
    maxConcurrency: options.closure.value.scheduling.maxConcurrency,
    laneLimits: Object.fromEntries(options.closure.value.scheduling.lanes.map((lane) => [lane.name, lane.maxConcurrency])),
    ...(options.scheduling?.maxEventsPerBuild === undefined
      ? {} : { maxEventsPerBuild: options.scheduling.maxEventsPerBuild }),
  };
  const worker = options.worker.create(driver, {
    scheduler: options.scheduler,
    stores: {
      builds: options.buildStore,
      operations: options.operationStore,
      dispatch: options.dispatchStore,
      journal: options.journal,
      artifacts: options.artifactStore,
    },
    scheduling,
    runtimeClosure: options.closure.value,
  });
  const credentialDescriptions = (options.endpoints ?? []).flatMap((item) => item.credentials);
  const credential = (endpoint: string, slot: string) => {
    const matches = credentialDescriptions.filter((item) => item.endpoint === endpoint && item.slot === slot);
    assert(matches.length === 1, matches.length === 0
      ? `Endpoint ${endpoint} has no credential slot ${slot}`
      : `Endpoint ${endpoint} repeats credential slot ${slot}`);
    return matches[0]!;
  };
  const credentialStatus = async (item: typeof credentialDescriptions[number]) => ({
    ...structuredClone(item),
    configured: await options.credentialStore.resolve(item.ref) !== undefined,
    writable: await writableCredentialStore(options.credentialStore, item.ref) !== undefined,
  });
  const stageAttachments = async (request: LocalBuildRequest): Promise<void> => {
    for (const item of request.attachments ?? []) {
      const stored = await options.artifactStore.put(Uint8Array.from(item.bytes), item.artifact.mediaType);
      assert(
        stored.digest === item.artifact.digest
          && stored.size === item.artifact.size
          && stored.mediaType === item.artifact.mediaType,
        `Source Artifact ${item.artifact.digest} does not match its staged bytes`,
      );
    }
  };
  const presentation = async (build: string): Promise<LocalBuildSubmission> => {
    const [snapshot, dispatch] = await Promise.all([
      options.buildStore.read(build),
      options.dispatchStore.read(build),
    ]);
    assert(snapshot !== undefined && dispatch !== undefined, `Build ${build} has no durable Runtime state`);
    const status: LocalBuildSubmission["status"] = dispatch.phase === "terminal"
      ? dispatch.terminal!
      : dispatch.phase === "leased" ? "running" : dispatch.phase;
    return { id: build, state: snapshot.state, status, dispatch };
  };

  const submit = async (request: LocalBuildRequest): Promise<LocalBuildSubmission> => {
    assert(request.id.trim().length > 0, "Build id must not be empty");
    await stageAttachments(request);
    let stored = await options.buildStore.read(request.id);
    if (stored === undefined) {
      try {
        stored = await options.buildStore.create(request.id, request.state);
      } catch (error) {
        stored = await options.buildStore.read(request.id);
        if (stored === undefined) throw error;
      }
    }
    assert(stored.state.id === request.state.id,
      `Build ${request.id} already names another Core Build`);
    const created = await options.dispatchStore.create(createBuildDispatchIdentity({
      build: request.id,
      core: request.state.id,
      runtimeClosure: options.closure.value.digest,
    }));
    if (created.status === "created") {
      await options.journal.append({
        at: Date.now(),
        kind: "dispatch-created",
        build: request.id,
        detail: { dispatch: created.snapshot.id },
      });
    }
    if (request.catalog !== undefined) {
      assert(buildCatalog !== undefined, "Build supplied Host catalog metadata but no BuildCatalog was selected");
      assert(request.catalog.core === request.state.id,
        `Build Catalog Core ${request.catalog.core} differs from Build ${request.state.id}`);
      await buildCatalog.record(request.id, request.catalog);
    }
    return await presentation(request.id);
  };

  const runBuild = async (
    request: LocalBuildRequest,
    follow: LocalBuildOptions = {},
  ): Promise<LocalBuildSubmission> => {
    let result = await submit(request);
    const startedAt = Date.now();
    const pollIntervalMs = nonNegativeInteger(follow.pollIntervalMs ?? 1_000, "pollIntervalMs");
    const maxWaitMs = follow.maxWaitMs === undefined
      ? undefined
      : nonNegativeInteger(follow.maxWaitMs, "maxWaitMs");
    while (follow.follow === true && !["complete", "failed", "cancelled"].includes(result.status)) {
      if (maxWaitMs !== undefined && Date.now() - startedAt + pollIntervalMs > maxWaitMs) return result;
      await wait(pollIntervalMs, follow.signal);
      result = await presentation(request.id);
    }
    return result;
  };
  return {
    build: runBuild,
    async buildMany(requests) {
      return await Promise.all(requests.map(submit));
    },
    async status(build) {
      return {
        build: await options.buildStore.read(build),
        catalog: await buildCatalog?.read(build),
        operations: await options.operationStore.list({ build }),
        dispatch: await options.dispatchStore.read(build),
      };
    },
    async queue() {
      return {
        dispatches: await options.dispatchStore.list(),
        capacity: await options.dispatchStore.listCapacity(),
      };
    },
    async operation(id) {
      return await options.operationStore.read(id);
    },
    async journal(query) {
      return await options.journal.list(query);
    },
    async credentials(endpoint) {
      const selected = credentialDescriptions.filter((item) => endpoint === undefined || item.endpoint === endpoint);
      return await Promise.all(selected.map(credentialStatus));
    },
    async putCredential(endpoint, slot, secret) {
      assert(secret.length > 0, "credential secret is empty");
      const item = credential(endpoint, slot);
      const store = await writableCredentialStore(options.credentialStore, item.ref);
      assert(store !== undefined, `CredentialStore ${item.ref.store} is not writable`);
      await store.put(item.ref, { secret });
      return await credentialStatus(item);
    },
    async deleteCredential(endpoint, slot) {
      const item = credential(endpoint, slot);
      const store = await writableCredentialStore(options.credentialStore, item.ref);
      assert(store !== undefined, `CredentialStore ${item.ref.store} is not writable`);
      const deleted = await store.delete(item.ref);
      return { deleted, credential: await credentialStatus(item) };
    },
    async builds() {
      return await buildCatalog?.list() ?? [];
    },
    async cancel(build, reason) {
      if (await options.dispatchStore.read(build) === undefined) return undefined;
      const dispatch = await options.dispatchStore.requestCancellation(build, reason);
      await options.journal.append({
        at: Date.now(),
        kind: "cancellation-requested",
        build,
        detail: { ...(reason === undefined ? {} : { reason }) },
      });
      return dispatch;
    },
    async workOnce(workOptions) {
      return await worker.runOnce(workOptions);
    },
    async work(workOptions) {
      await worker.run(workOptions);
    },
    async readArtifact(digest) {
      return await options.artifactStore.get(digest);
    },
    async openArtifact(digest) {
      if (isStreamingArtifactStore(options.artifactStore)) return await options.artifactStore.open(digest);
      const bytes = await options.artifactStore.get(digest);
      return bytes === undefined ? undefined : (async function* () { yield bytes; })();
    },
    async garbageCollectArtifacts(gc = {}) {
      assert(isManagedArtifactStore(options.artifactStore),
        "selected ArtifactStore does not expose explicit retention management");
      assert(isEnumerableBuildStore(options.buildStore),
        "selected BuildStore does not expose the maintenance index required for Artifact GC");
      const reachable = new Set<import("@narratage/protocol").Digest>();
      for (const snapshot of await options.buildStore.list()) collectArtifactDigests(snapshot.state, reachable);
      for (const operation of await options.operationStore.list({})) collectArtifactDigests(operation, reachable);
      const stored = await options.artifactStore.list();
      const unreachable = stored.filter((digest) => !reachable.has(digest)).sort();
      const deleted: import("@narratage/protocol").Digest[] = [];
      if (gc.apply === true) {
        for (const digest of unreachable) {
          if (await options.artifactStore.delete(digest)) deleted.push(digest);
        }
      }
      return {
        reachable: [...reachable].sort(),
        unreachable,
        deleted,
      };
    },
    close() {},
  };
}

/**
 * Zero-service local distribution. The Runtime authority stays in this process while configured
 * Capability Endpoints may execute locally, in a vendor API, in Lambda, or on a hosted service.
 */
export async function createProjectLocalRuntime(
  options: ProjectLocalRuntimeOptions,
): Promise<LocalRuntime> {
  const root = resolve(options.root ?? process.cwd());
  const packageRoot = resolve(options.packageRoot ?? root);
  const lockedPackageSet = options.packageLock === undefined
    ? undefined
    : await loadNodePackageSet(resolve(root, options.packageLock), packageRoot);
  const lockedComponents = lockedPackageSet === undefined
    ? []
    : collectNodePackageComponents(lockedPackageSet.contributions);
  const configuredComponents = [...lockedComponents, ...(options.components ?? [])];
  const projectServices = await createProjectRuntimeServices(root, options);
  const services = projectServices.assembly;
  const selection = projectServices.selection;
  const endpointPackages = options.endpoints ?? [];

  try {
    verifyEndpointPackages(endpointPackages);
    const modules = new RuntimeModuleRegistry();
    registerManifests(modules, [
      ...services.manifests,
      ...endpointPackages.map((item) => item.manifest),
    ]);
    const profile = sealRuntimeProfile({
      name: "svml.local.project",
      instances: [
        ...services.instances,
        ...endpointPackages.map((item) => item.instance),
      ],
      scheduler: selection.scheduler,
      worker: selection.worker,
      stores: {
        build: selection.stores.build,
        operations: selection.stores.operations,
        dispatch: selection.stores.dispatch,
        journal: selection.stores.journal,
        artifacts: selection.stores.artifacts,
        credentials: selection.stores.credentials,
      },
      endpoints: endpointPackages.flatMap((item) => item.bindings),
      scheduling: {
        maxConcurrency: options.scheduling.maxConcurrency,
        lanes: Object.entries(options.scheduling.lanes ?? {}).map(([name, maxConcurrency]) => ({
          name,
          maxConcurrency,
        })),
      },
    });
    const closure = resolveRuntimeProfile(modules, profile, {
      allowedPermissions: projectServices.allowedPermissions,
    });
    const runtime = await createLocalRuntime({
      buildStore: services.buildStore,
      ...(projectServices.catalog === undefined ? {} : { buildCatalog: projectServices.catalog }),
      operationStore: services.operationStore,
      dispatchStore: services.dispatchStore,
      journal: services.journal,
      artifactStore: services.artifactStore,
      credentialStore: services.credentialStore,
      scheduler: services.scheduler,
      worker: services.worker,
      ...(configuredComponents.length === 0
        ? {}
        : { components: configuredComponents }),
      endpoints: endpointPackages,
      closure: { modules, value: closure, allowedPermissions: projectServices.allowedPermissions },
      scheduling: {
        ...(options.scheduling.maxEventsPerBuild === undefined
          ? {}
          : { maxEventsPerBuild: options.scheduling.maxEventsPerBuild }),
      },
      ...(options.validators === undefined ? {} : { validators: options.validators }),
      ...(lockedPackageSet === undefined ? {} : { implementationClosure: lockedPackageSet.lock.digest }),
    });
    return {
      build: runtime.build,
      buildMany: runtime.buildMany,
      status: runtime.status,
      queue: runtime.queue,
      operation: runtime.operation,
      journal: runtime.journal,
      credentials: runtime.credentials,
      putCredential: runtime.putCredential,
      deleteCredential: runtime.deleteCredential,
      builds: runtime.builds,
      cancel: runtime.cancel,
      workOnce: runtime.workOnce,
      work: runtime.work,
      readArtifact: runtime.readArtifact,
      openArtifact: runtime.openArtifact,
      garbageCollectArtifacts: runtime.garbageCollectArtifacts,
      close() {
        return projectServices.close();
      },
    };
  } catch (error) {
    await projectServices.close();
    throw error;
  }
}
