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
  LocalBuildScheduler,
  createBuildDispatchIdentity,
  isStreamingArtifactStore,
} from "@narratage/runtime";
import { TypeValidatorRegistry } from "@narratage/validation";

import { createProjectRuntimeInfrastructure } from "./project-infrastructure.js";
import { createLocalRuntimeControl } from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
import { createDurableLocalWorker } from "./worker.js";
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

function verifyEndpointPackages(packages: readonly EndpointPackage[]): void {
  const instances = new Set<string>();
  for (const item of packages) {
    assert(item.instance.id.trim().length > 0, "Endpoint instance id is empty");
    assert(!instances.has(item.instance.id), `Endpoint instance ${item.instance.id} is configured twice`);
    instances.add(item.instance.id);
    assert(item.offers.length > 0, `${item.instance.id} binds no exact capability`);
    for (const offer of item.offers) {
      assert(offer.endpoint === item.instance.id,
        `${item.instance.id} offer points to ${offer.endpoint}, not ${item.instance.id}`);
    }
  }
}

export async function createLocalRuntime(
  options: CreateLocalRuntimeOptions,
): Promise<LocalRuntime> {
  const buildCatalog = options.buildCatalog;
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  const validators = options.validators ?? new TypeValidatorRegistry();
  for (const component of options.components ?? []) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(producers, component.producers ?? []);
  }
  for (const endpoint of options.endpoints ?? []) await endpoint.install(endpoints);
  const driver = new NodeDriver({
    producers,
    endpoints,
    artifacts: options.artifactStore,
    credentials: options.credentialStore,
    operations: options.operationStore,
    validators,
  });
  const scheduling = options.scheduling;
  const worker = createDurableLocalWorker(driver, {
    scheduler: {
      create(executor, schedulerOptions) {
        return new LocalBuildScheduler(executor, schedulerOptions);
      },
    },
    stores: {
      builds: options.buildStore,
      operations: options.operationStore,
      dispatch: options.dispatchStore,
      artifacts: options.artifactStore,
    },
    scheduling,
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
    ...(options.close === undefined ? {} : { close: options.close }),
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
      : dispatch.phase;
    return { id: build, state: snapshot.state, status, dispatch };
  };

  const submit = async (request: LocalBuildRequest): Promise<LocalBuildSubmission> => {
    assert(request.id.trim().length > 0, "Build id must not be empty");
    if (request.catalog !== undefined) {
      assert(buildCatalog !== undefined, "Build supplied Host catalog metadata but no BuildCatalog was selected");
    }
    await stageAttachments(request);
    await options.buildStore.create(request.id, request.definition);
    await options.dispatchStore.create(createBuildDispatchIdentity({
      build: request.id,
      ...(request.implementationPackages === undefined ? {} : {
        implementationPackages: request.implementationPackages,
      }),
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
    async workOnce() {
      return await worker.runOnce();
    },
    async work(workOptions) {
      await worker.run(workOptions);
    },
    close: control.close,
  };
}

/**
 * Node project assembly over only the Runtime infrastructure packages selected by the caller. Capability
 * Endpoints may execute locally, in a vendor API, in Lambda, or on a hosted service; none is
 * inferred from this local process boundary.
 */
export async function createProjectLocalRuntime(
  options: ProjectLocalRuntimeOptions,
): Promise<LocalRuntime> {
  const root = resolve(options.dataRoot ?? process.cwd());
  const packageRoot = resolve(options.packageRoot ?? root);
  const configuredComponents = options.components ?? [];
  const projectInfrastructure = await createProjectRuntimeInfrastructure(root, options);
  const infrastructure = projectInfrastructure.assembly;
  const endpointPackages = options.endpoints ?? [];

  try {
    verifyEndpointPackages(endpointPackages);
    const runtime = await createLocalRuntime({
      buildStore: infrastructure.buildStore,
      ...(projectInfrastructure.catalog === undefined ? {} : { buildCatalog: projectInfrastructure.catalog }),
      operationStore: infrastructure.operationStore,
      dispatchStore: infrastructure.dispatchStore,
      artifactStore: infrastructure.artifactStore,
      credentialStore: infrastructure.credentialStore,
      ...(configuredComponents.length === 0
        ? {}
        : { components: configuredComponents }),
      endpoints: endpointPackages,
      scheduling: {
        maxConcurrency: options.scheduling.maxConcurrency,
        ...(options.scheduling.resources === undefined ? {} : {
          resourceLimits: options.scheduling.resources,
        }),
      },
      close: projectInfrastructure.close,
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
      workOnce: runtime.workOnce,
      work: runtime.work,
      readArtifact: runtime.readArtifact,
      openArtifact: runtime.openArtifact,
      garbageCollectArtifacts: runtime.garbageCollectArtifacts,
      close: runtime.close,
    };
  } catch (error) {
      await projectInfrastructure.close();
    throw error;
  }
}
