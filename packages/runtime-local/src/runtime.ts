import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@hypit/component-kit";
import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
} from "@hypit/driver-node";
import {
  isStreamingArtifactStore,
} from "@hypit/runtime";
import { TypeValidatorRegistry } from "@hypit/validation";

import { createLocalRuntimeArchiveControl, createLocalRuntimeArtifactAccess } from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
import { createDurableLocalWorker } from "./worker.js";
import type {
  CreateLocalRuntimeOptions,
  LocalBuildOptions,
  LocalBuildRequest,
  LocalBuildSubmission,
  LocalRuntime,
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

export async function createLocalRuntime(
  options: CreateLocalRuntimeOptions,
): Promise<LocalRuntime> {
  const openBuildResultRepository = options.openBuildResultRepository;
  const buildCatalog = options.buildCatalog;
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  const validators = new TypeValidatorRegistry();
  for (const component of options.components ?? []) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(producers, component.producers ?? []);
  }
  for (const endpoint of options.endpoints ?? []) await endpoint.install(endpoints);
  const loadedComponentPackages = new Set<string>();
  let componentInstallation = Promise.resolve();
  const installComponentPackages = async (specifiers: readonly string[]): Promise<void> => {
    const task = componentInstallation.then(async () => {
      const missing = [...new Set(specifiers)].filter((item) => !loadedComponentPackages.has(item));
      if (missing.length === 0) return;
      assert(options.loadComponentPackages !== undefined,
        `Build requires component package ${missing[0]} but this Runtime cannot load installed packages`);
      const loaded = await options.loadComponentPackages(missing);
      const fresh = loaded.filter((item) => !loadedComponentPackages.has(item.specifier));
      for (const item of fresh) {
        for (const component of item.components) {
          registerTypeValidatorFacets(validators, component.validators ?? []);
          registerProducerFacets(producers, component.producers ?? []);
        }
      }
      for (const item of fresh) loadedComponentPackages.add(item.specifier);
    });
    componentInstallation = task.then(() => undefined, () => undefined);
    await task;
  };
  const driver = new NodeDriver({
    producers,
    endpoints,
    artifacts: options.artifactStore,
    ...(options.artifactStoreForBuild === undefined ? {} : { artifactsForBuild: options.artifactStoreForBuild }),
    credentials: options.credentialStore,
    operations: options.operationStore,
    validators,
  });
  const worker = createDurableLocalWorker(driver, {
    stores: {
      builds: options.buildStore,
      ...(buildCatalog === undefined ? {} : { catalog: buildCatalog }),
      operations: options.operationStore,
      dispatch: options.dispatchStore,
    },
    artifactStore: options.artifactStore,
    ...(options.artifactStoreForBuild === undefined ? {} : { artifactStoreForBuild: options.artifactStoreForBuild }),
    ...(options.clearBuildArtifacts === undefined ? {} : { clearBuildArtifacts: options.clearBuildArtifacts }),
    openBuildResultRepository: async (location) => {
      assert(openBuildResultRepository !== undefined, "this Runtime cannot open Build Result Repositories");
      return await openBuildResultRepository(location);
    },
    installComponentPackages,
  });
  const credentialControl = createLocalCredentialControl({
    credentialStore: options.credentialStore,
    endpoints: options.endpoints ?? [],
  });
  const archive = createLocalRuntimeArchiveControl({
    buildStore: options.buildStore,
    ...(buildCatalog === undefined ? {} : { buildCatalog }),
    operationStore: options.operationStore,
    dispatchStore: options.dispatchStore,
  });
  const artifacts = createLocalRuntimeArtifactAccess({
    artifactStore: options.artifactStore,
  });
  const stageAttachments = async (request: LocalBuildRequest): Promise<void> => {
    const artifactStore = options.artifactStoreForBuild?.(request.id) ?? options.artifactStore;
    for (const item of request.attachments ?? []) {
      if (await artifactStore.has(item.artifact.digest)) continue;
      const stream = await item.open();
      const stored = isStreamingArtifactStore(artifactStore)
        ? await artifactStore.putStream(stream, item.artifact.mediaType)
        : await artifactStore.put(await (async () => {
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
  const presentation = async (build: string, previousState?: LocalBuildSubmission["state"]): Promise<LocalBuildSubmission> => {
    const [snapshot, dispatch] = await Promise.all([
      options.buildStore.read(build),
      options.dispatchStore.read(build),
    ]);
    assert(dispatch !== undefined, `Build ${build} has no Runtime dispatch`);
    const state = snapshot?.state ?? previousState;
    assert(state !== undefined, `Build ${build} has no execution state`);
    const status: LocalBuildSubmission["status"] = dispatch.phase === "terminal"
      ? dispatch.terminal!
      : dispatch.phase;
    return { id: build, state, status, dispatch };
  };

  const submit = async (request: LocalBuildRequest): Promise<LocalBuildSubmission> => {
    assert(request.id.trim().length > 0 && !request.id.includes("/") && !request.id.includes("\\"),
      "Build id must be one directory-safe name");
    if (request.catalog !== undefined) {
      assert(buildCatalog !== undefined, "Build supplied Host catalog metadata but no BuildCatalog was selected");
    }
    await stageAttachments(request);
    await options.buildStore.create(request.id, request.definition);
    const resultRequest = request.result;
    if (resultRequest !== undefined) {
      assert(openBuildResultRepository !== undefined, "this Runtime cannot open Build Result Repositories");
      const opened = await openBuildResultRepository(resultRequest.repository);
      try {
        assert(request.catalog !== undefined, "Build Result requires Author catalog names");
        const aliases = request.catalog.aliases.flatMap((alias) => alias.ref.kind === "logical-output"
          ? [{ name: alias.name, output: alias.ref.id }]
          : []);
        const names = new Map(aliases.map((alias) => [alias.output, alias.name]));
        await opened.repository.create({
          id: request.id,
          ...(resultRequest.name === undefined ? {} : { name: resultRequest.name }),
          source: request.catalog.source,
          ...(request.catalog.run === undefined ? {} : { run: request.catalog.run }),
          targets: request.definition.request.targets.map((target) => names.get(target.output) ?? target.output),
          aliases,
          ...(resultRequest.reuses === undefined ? {} : { reuses: resultRequest.reuses }),
        });
      } finally {
        await opened.close?.();
      }
    }
    await options.dispatchStore.create({
      build: request.id,
      componentPackages: [...new Set(request.componentPackages ?? [])].sort(),
      ...(resultRequest === undefined ? {} : { result: resultRequest.repository }),
    });
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
      result = await presentation(request.id, result.state);
    }
    return result;
  };
  return {
    ...archive,
    ...artifacts,
    ...credentialControl,
    build: runBuild,
    async workOnce() {
      return await worker.runOnce();
    },
    async work(workOptions) {
      await worker.run(workOptions);
    },
    close() {
      return options.close?.();
    },
  };
}
