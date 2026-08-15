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
import {
  assertRuntimeClosureAdmission,
  RuntimeModuleRegistry,
  createBuildDispatchIdentity,
  isStreamingArtifactStore,
  nonTerminalDispatchPhases,
  resolveRuntimeProfile,
  sameBuildCatalogDescriptor,
  sealRuntimeProfile,
} from "@narratage/runtime";
import { TypeValidatorRegistry } from "@narratage/validation";
import type {
  RuntimeModuleManifest,
  RuntimeProfileInstance,
} from "@narratage/runtime";

import { createProjectRuntimeServices } from "./project-services.js";
import { createLocalRuntimeControl } from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
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
  const instances = new Set<string>();
  for (const item of packages) {
    assert(item.instance.id.trim().length > 0, "Endpoint instance id is empty");
    assert(!instances.has(item.instance.id), `Endpoint instance ${item.instance.id} is configured twice`);
    instances.add(item.instance.id);
    assert(item.manifest.name === item.instance.facet.module.name
      && item.manifest.version === item.instance.facet.module.version,
    `${item.instance.id} instance ${facetKey(item.instance)} is outside its Runtime Manifest`);
    assert(item.bindings.length > 0, `${item.instance.id} binds no exact capability`);
    for (const binding of item.bindings) {
      assert(binding.endpoint === item.instance.id,
        `${item.instance.id} binding points to ${binding.endpoint}, not ${item.instance.id}`);
    }
  }
}

export async function createLocalRuntime(
  options: CreateLocalRuntimeOptions,
): Promise<LocalRuntime> {
  const buildCatalog = options.buildCatalog;
  if (options.scheduling?.maxConcurrency !== undefined || options.scheduling?.resourceLimits !== undefined) {
    throw new Error("a locked Runtime Closure owns maxConcurrency and resource limits");
  }
  const runtimeClosure = options.closure.value.digest;
  assertRuntimeClosureAdmission(
    runtimeClosure,
    await options.dispatchStore.list({ phases: nonTerminalDispatchPhases }),
  );
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  const validators = options.validators ?? new TypeValidatorRegistry();
  for (const component of options.components ?? []) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(producers, component.producers ?? []);
  }
  for (const endpoint of options.endpoints ?? []) await endpoint.install(endpoints);
  endpoints.applyRuntimeClosure(options.closure.value, options.closure.modules);
  const driver = new NodeDriver({
    producers,
    endpoints,
    artifacts: options.artifactStore,
    credentials: options.credentialStore,
    operations: options.operationStore,
    validators,
  });
  const scheduling = {
    maxConcurrency: options.closure.value.scheduling.maxConcurrency,
    resourceLimits: Object.fromEntries(options.closure.value.scheduling.resources.map((resource) => [resource.id, resource.maxConcurrency])),
  };
  const worker = options.worker.create(driver, {
    scheduler: options.scheduler,
    stores: {
      builds: options.buildStore,
      operations: options.operationStore,
      dispatch: options.dispatchStore,
      artifacts: options.artifactStore,
    },
    scheduling,
    runtimeClosure: options.closure.value,
  });
  const credentialControl = createLocalCredentialControl({
    credentialStore: options.credentialStore,
    endpoints: options.endpoints ?? [],
  });
  const control = createLocalRuntimeControl({
    buildStore: options.buildStore,
    ...(buildCatalog === undefined ? {} : { buildCatalog }),
    operationStore: options.operationStore,
    dispatchStore: options.dispatchStore,
    artifactStore: options.artifactStore,
  });
  const stageAttachments = async (request: LocalBuildRequest): Promise<void> => {
    for (const item of request.attachments ?? []) {
      if (await options.artifactStore.has(item.artifact.digest)) continue;
      const stream = await item.open();
      const stored = isStreamingArtifactStore(options.artifactStore)
        ? await options.artifactStore.putStream(stream, item.artifact.mediaType)
        : await options.artifactStore.put(await (async () => {
            const chunks: Uint8Array[] = [];
            let size = 0;
            for await (const chunk of stream) {
              chunks.push(Uint8Array.from(chunk));
              size += chunk.byteLength;
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.byteLength;
            }
            return bytes;
          })(), item.artifact.mediaType);
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
    if (request.catalog !== undefined) {
      assert(buildCatalog !== undefined, "Build supplied Host catalog metadata but no BuildCatalog was selected");
      assert(request.catalog.core === request.state.id,
        `Build Catalog Core ${request.catalog.core} differs from Build ${request.state.id}`);
      const existingCatalog = await buildCatalog.read(request.id);
      assert(existingCatalog === undefined || sameBuildCatalogDescriptor(existingCatalog, request.catalog),
        `Build Catalog ${request.id} already has another source, Run Source or output naming`);
    }
    await stageAttachments(request);
    // The Host creates a fresh id for every Build. Reading an exact duplicate
    // here only closes the crash window between durable Store writes; it is not
    // a Source-based lookup and is not exposed as a way to reopen an old Build.
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
      `Build submission ${request.id} conflicts with another Core state`);
    const created = await options.dispatchStore.create(createBuildDispatchIdentity({
      build: request.id,
      core: request.state.id,
      runtimeClosure,
    }));
    if (request.catalog !== undefined) {
      await buildCatalog!.record(request.id, request.catalog);
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
    ...control,
    ...credentialControl,
    build: runBuild,
    async buildMany(requests) {
      return await Promise.all(requests.map(submit));
    },
    async workOnce(workOptions) {
      return await worker.runOnce(workOptions);
    },
    async work(workOptions) {
      await worker.run(workOptions);
    },
    close: control.close,
  };
}

/**
 * Node project assembly over only the Runtime service packages selected by the caller. Capability
 * Endpoints may execute locally, in a vendor API, in Lambda, or on a hosted service; none is
 * inferred from this local process boundary.
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
    : collectNodePackageComponents(lockedPackageSet.packages.map((item) => item.contribution));
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
        artifacts: selection.stores.artifacts,
        credentials: selection.stores.credentials,
      },
      endpoints: endpointPackages.flatMap((item) => item.bindings),
      scheduling: {
        maxConcurrency: options.scheduling.maxConcurrency,
        resources: Object.entries(options.scheduling.resources ?? {}).map(([id, maxConcurrency]) => ({
          id,
          maxConcurrency,
        })),
      },
    });
    const closure = resolveRuntimeProfile(modules, profile);
    const runtime = await createLocalRuntime({
      buildStore: services.buildStore,
      ...(projectServices.catalog === undefined ? {} : { buildCatalog: projectServices.catalog }),
      operationStore: services.operationStore,
      dispatchStore: services.dispatchStore,
      artifactStore: services.artifactStore,
      credentialStore: services.credentialStore,
      scheduler: services.scheduler,
      worker: services.worker,
      ...(configuredComponents.length === 0
        ? {}
        : { components: configuredComponents }),
      endpoints: endpointPackages,
      closure: { modules, value: closure },
      ...(options.validators === undefined ? {} : { validators: options.validators }),
    });
    return {
      build: runtime.build,
      buildMany: runtime.buildMany,
      status: runtime.status,
      activity: runtime.activity,
      queue: runtime.queue,
      operation: runtime.operation,
      credentials: runtime.credentials,
      putCredential: runtime.putCredential,
      deleteCredential: runtime.deleteCredential,
      builds: runtime.builds,
      cancel: runtime.cancel,
      cancelOperation: runtime.cancelOperation,
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
