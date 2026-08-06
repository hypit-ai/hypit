import { resolve } from "node:path";

import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@svml/component-kit";
import {
  FileArtifactStore,
  fileArtifactStoreFacet,
  fileArtifactStoreRuntimeManifest,
} from "@svml/artifact-store-fs";
import {
  EnvironmentCredentialStore,
  environmentCredentialStoreFacet,
  environmentCredentialStoreRuntimeManifest,
} from "@svml/credential-store-env";
import {
  HostRegistry,
  NodeDriver,
  ProviderRegistry,
} from "@svml/driver-node";
import {
  loadNodePackageSet,
  nodePackageComponents,
} from "@svml/package-loader-node";
import {
  LocalBuildScheduler,
  RuntimeModuleRegistry,
  localSchedulerOptionsFromClosure,
  resolveRuntimeProfile,
  sealRuntimeProfile,
} from "@svml/runtime";
import { TypeValidatorRegistry } from "@svml/validation";
import type {
  RuntimeModuleManifest,
  RuntimeProfileInstance,
} from "@svml/runtime";
import {
  SqliteRuntimeState,
  sqliteBuildStoreFacet,
  sqliteOperationStoreFacet,
  sqliteStoreRuntimeManifest,
} from "@svml/store-sqlite";

import {
  localRuntimeManifest,
  localSchedulerFacet,
} from "./manifest.js";
import type {
  CreateLocalRuntimeOptions,
  LocalBuildOptions,
  LocalBuildRequest,
  LocalRuntime,
  NodeArtifactStorePackage,
  NodeProviderPackage,
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

function verifyProviderPackages(packages: readonly NodeProviderPackage[]): void {
  const names = new Set<string>();
  const instances = new Set<string>();
  for (const item of packages) {
    assert(item.name.trim().length > 0, "Provider package name must not be empty");
    assert(!names.has(item.name), `Provider package ${item.name} is configured twice`);
    names.add(item.name);
    assert(item.instance.id.trim().length > 0, `${item.name} Provider instance id is empty`);
    assert(!instances.has(item.instance.id), `Provider instance ${item.instance.id} is configured twice`);
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

function verifyArtifactPackage(item: NodeArtifactStorePackage): void {
  assert(item.name.trim().length > 0, "ArtifactStore package name must not be empty");
  assert(item.instance.id.trim().length > 0, `${item.name} ArtifactStore instance id is empty`);
  assert(item.manifest.name === item.instance.facet.module.name
    && item.manifest.version === item.instance.facet.module.version,
  `${item.name} instance ${facetKey(item.instance)} is outside its Runtime Manifest`);
  const facet = item.manifest.facets.find((candidate) => candidate.name === item.instance.facet.name);
  assert(facet?.role === "artifact-store", `${item.name} instance is not an artifact-store facet`);
}

export async function createLocalRuntime(
  options: CreateLocalRuntimeOptions,
): Promise<LocalRuntime> {
  if (options.closure !== undefined
    && (options.scheduling?.maxConcurrency !== undefined
      || options.scheduling?.laneLimits !== undefined)) {
    throw new Error("a locked Runtime Closure owns maxConcurrency and lane limits");
  }
  const hosts = new HostRegistry();
  const providers = new ProviderRegistry();
  const validators = options.validators ?? new TypeValidatorRegistry();
  const componentNames = new Set<string>();
  for (const component of options.components ?? []) {
    assert(component.name.trim().length > 0, "Component package name must not be empty");
    assert(!componentNames.has(component.name), `Component package ${component.name} is configured twice`);
    componentNames.add(component.name);
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(hosts, component.producers ?? []);
  }
  for (const provider of options.providers ?? []) await provider.install(providers);
  if (options.closure !== undefined) {
    providers.applyRuntimeClosure(
      options.closure.value,
      options.closure.modules,
      { allowedPermissions: options.closure.allowedPermissions ?? [] },
    );
  }
  const driver = new NodeDriver({
    registry: hosts,
    providers,
    artifacts: options.artifactStore,
    ...(options.credentialStore === undefined ? {} : { credentials: options.credentialStore }),
    ...(options.operationStore === undefined ? {} : { operations: options.operationStore }),
    validators,
    ...(options.implementationClosure === undefined
      ? {}
      : { implementationClosure: options.implementationClosure }),
  });
  const closureScheduling = options.closure === undefined
    ? {}
    : localSchedulerOptionsFromClosure(options.closure.value);
  const scheduler = new LocalBuildScheduler(driver, {
    ...closureScheduling,
    ...(options.scheduling ?? {}),
    buildStore: options.buildStore,
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
  const scheduled = (request: LocalBuildRequest) => ({ id: request.id, state: request.state });
  const runBuild = async (
    request: LocalBuildRequest,
    follow: LocalBuildOptions = {},
  ) => {
    await stageAttachments(request);
    const startedAt = Date.now();
    const pollIntervalMs = nonNegativeInteger(follow.pollIntervalMs ?? 1_000, "pollIntervalMs");
    const maxWaitMs = follow.maxWaitMs === undefined
      ? undefined
      : nonNegativeInteger(follow.maxWaitMs, "maxWaitMs");
    while (true) {
      const [result] = await scheduler.run([scheduled(request)]);
      if (result === undefined) throw new Error(`Local Scheduler returned no result for ${request.id}`);
      if (follow.follow !== true || result.status !== "paused") return result;
      const pending = result.journal.filter((item) => item.status === "pending");
      if (pending.length === 0) return result;
      const now = Date.now();
      const wakeAt = Math.min(...pending.map((item) => item.wakeAt ?? now + pollIntervalMs));
      const delay = Math.max(0, wakeAt - now);
      if (maxWaitMs !== undefined && now - startedAt + delay > maxWaitMs) return result;
      await wait(delay, follow.signal);
    }
  };
  return {
    build: runBuild,
    async buildMany(requests) {
      await Promise.all(requests.map(stageAttachments));
      return await scheduler.run(requests.map(scheduled));
    },
    async status(build) {
      return {
        build: await options.buildStore.read(build),
        operations: options.operationStore === undefined ? [] : await options.operationStore.list({ build }),
      };
    },
    async cancel(build) {
      if (options.operationStore === undefined) throw new Error("Local Runtime has no OperationStore");
      const snapshot = await options.buildStore.read(build);
      if (snapshot === undefined) return undefined;
      const active = (await options.operationStore.list({ build }))
        .filter((operation) => operation.status === "created" || operation.status === "pending");
      if (active.length === 0) return undefined;
      for (const operation of active) await driver.cancelOperation(snapshot.state, operation);
      const [result] = await scheduler.run([{ id: build, state: snapshot.state }]);
      return result;
    },
    close() {},
  };
}

/**
 * Zero-service local distribution. The Runtime authority stays in this process while configured
 * Provider Endpoints may execute locally, in a vendor API, in Lambda, or on Hypit.
 */
export async function createProjectLocalRuntime(
  options: ProjectLocalRuntimeOptions = {},
): Promise<LocalRuntime> {
  if (options.artifacts !== undefined && options.artifactPath !== undefined) {
    throw new Error("artifactPath configures the default filesystem store and cannot accompany artifacts");
  }
  const root = resolve(options.root ?? process.cwd());
  const lockedPackageSet = options.packageLock === undefined
    ? undefined
    : await loadNodePackageSet(resolve(root, options.packageLock), root);
  const lockedComponents = lockedPackageSet === undefined
    ? []
    : nodePackageComponents(lockedPackageSet.packages);
  const configuredComponents = [...lockedComponents, ...(options.components ?? [])];
  const state = new SqliteRuntimeState(resolve(root, options.statePath ?? ".svml/runtime.sqlite"));
  const defaultArtifacts: NodeArtifactStorePackage = {
    name: "@svml/artifact-store-fs",
    manifest: fileArtifactStoreRuntimeManifest,
    instance: { id: "artifacts.fs", facet: fileArtifactStoreFacet },
    store: new FileArtifactStore(resolve(root, options.artifactPath ?? ".svml/artifacts")),
  };
  const artifacts = options.artifacts ?? defaultArtifacts;
  verifyArtifactPackage(artifacts);
  const providerPackages = options.providers ?? [];
  verifyProviderPackages(providerPackages);

  try {
    const modules = new RuntimeModuleRegistry();
    registerManifests(modules, [
      localRuntimeManifest,
      sqliteStoreRuntimeManifest,
      artifacts.manifest,
      environmentCredentialStoreRuntimeManifest,
      ...providerPackages.map((item) => item.manifest),
    ]);
    const profile = sealRuntimeProfile({
      name: "svml.local.project",
      instances: [
        { id: "scheduler.local", facet: localSchedulerFacet },
        { id: "builds.sqlite", facet: sqliteBuildStoreFacet },
        { id: "operations.sqlite", facet: sqliteOperationStoreFacet },
        artifacts.instance,
        { id: "credentials.env", facet: environmentCredentialStoreFacet },
        ...providerPackages.map((item) => item.instance),
      ],
      scheduler: "scheduler.local",
      stores: {
        build: "builds.sqlite",
        operations: "operations.sqlite",
        artifacts: artifacts.instance.id,
        credentials: "credentials.env",
      },
      providers: providerPackages.flatMap((item) => item.bindings),
      scheduling: {
        maxConcurrency: options.scheduling?.maxConcurrency ?? 4,
        lanes: Object.entries(options.scheduling?.lanes ?? {}).map(([name, maxConcurrency]) => ({
          name,
          maxConcurrency,
        })),
      },
    });
    const allowedPermissions = [
      "filesystem:state",
      ...(options.artifacts === undefined ? ["filesystem:artifacts"] : []),
      "environment:credentials",
      ...(options.allowedPermissions ?? []),
    ];
    const closure = resolveRuntimeProfile(modules, profile, { allowedPermissions });
    const runtime = await createLocalRuntime({
      buildStore: state.builds,
      operationStore: state.operations,
      artifactStore: artifacts.store,
      credentialStore: new EnvironmentCredentialStore(),
      ...(configuredComponents.length === 0
        ? {}
        : { components: configuredComponents }),
      providers: providerPackages,
      closure: { modules, value: closure, allowedPermissions },
      scheduling: {
        ...(options.scheduling?.maxEventsPerBuild === undefined
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
      cancel: runtime.cancel,
      close() {
        state.close();
      },
    };
  } catch (error) {
    state.close();
    throw error;
  }
}
