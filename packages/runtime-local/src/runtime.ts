import { createActionExecutor } from "./actions.js";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  producerPackagesFromFacets,
  registerProducerFacets,
} from "@hypit/hypit/producer";
import {
  ProducerRegistry,
  Executor,
  EndpointRegistry,
} from "@hypit/hypit/executor";
import {
  isStreamingResourceStore,
} from "@hypit/hypit/runtime";
import { installEndpoint } from "@hypit/hypit/endpoint";
import { assertOrderedBuildId, parseCapabilityKey, valueBlobRefs } from "@hypit/hypit/protocol";
import type { BuildDefinition } from "@hypit/hypit/protocol";
import { refinementPackagesFromFacets, registerTypeRefinements, RefinementRegistry } from "@hypit/hypit/refinement";
import { materializeBuild } from "@hypit/hypit/kernel";

import { createLocalRuntimeControl } from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
import { createLocalResultWriter } from "./result-writer.js";
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

function projectPath(root: string, path: string): string {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const relation = relative(resolve(root), absolute);
  assert(relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation)),
    `Build Result source ${path} is outside project ${resolve(root)}`);
  return (relation || ".").split(sep).join("/");
}

function requiredInitialResources(request: LocalBuildRequest): ReadonlySet<string> {
  const definition = request.definition;
  const publicOwnedRecords = request.catalog.publication.outputs.flatMap((published) => {
    if (published.source.kind === "historical-output") return [];
    return [published.source.record];
  });
  const recordIds = new Set([
    ...publicOwnedRecords,
    ...definition.plan.steps.flatMap((step) => Object.values(step.inputs)),
  ]);
  const resources = new Set<string>();
  definition.program.records
    .filter((record) => recordIds.has(record.id))
    .forEach((record) => {
      for (const { blob } of valueBlobRefs(record.value)) resources.add(blob.resource);
    });
  return resources;
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

/** Providers declare everything they can do; the Profile that selected them says who does it. */
export function applyEndpointBindings(registry: EndpointRegistry, bindings: Readonly<Record<string, string>> | undefined): void {
  for (const [key, endpointId] of Object.entries(bindings ?? {})) registry.bind(parseCapabilityKey(key), endpointId);
}

export async function createLocalRuntime(
  options: CreateLocalRuntimeOptions,
): Promise<LocalRuntime> {
  const openBuildResultRepository = options.openBuildResultRepository;
  const buildCatalog = options.buildCatalog;
  const producers = new ProducerRegistry();
  const endpoints = new EndpointRegistry();
  const refinements = new RefinementRegistry();
  for (const pack of options.producerPackages ?? []) registerProducerFacets(producers, pack.producers ?? []);
  for (const pack of options.refinementPackages ?? []) registerTypeRefinements(refinements, pack.refinements ?? []);
  for (const endpoint of options.endpoints ?? []) await installEndpoint(endpoint, endpoints);
  applyEndpointBindings(endpoints, options.bindings);
  const loadedProducerPackages = new Set<string>();
  let componentInstallation = Promise.resolve();
  const installProducerPackages = async (specifiers: readonly string[]): Promise<void> => {
    const task = componentInstallation.then(async () => {
      const missing = [...new Set(specifiers)].filter((item) => !loadedProducerPackages.has(item));
      if (missing.length === 0) return;
      assert(options.loadProducerPackages !== undefined,
        `Build requires execution package ${missing[0]} but this Runtime cannot load installed packages`);
      const loaded = await options.loadProducerPackages(missing);
      const fresh = loaded.filter((item) => !loadedProducerPackages.has(item.specifier));
      for (const item of fresh) {
        const facets = item.contribution.facets ?? [];
        for (const pack of producerPackagesFromFacets(facets)) registerProducerFacets(producers, pack.producers ?? []);
        for (const pack of refinementPackagesFromFacets(facets)) registerTypeRefinements(refinements, pack.refinements ?? []);
      }
      for (const item of fresh) loadedProducerPackages.add(item.specifier);
    });
    componentInstallation = task.then(() => undefined, () => undefined);
    await task;
  };
  const driver = new Executor({
    producers,
    endpoints,
    resources: options.resourceStore,
    ...(options.resourceStoreForBuild === undefined ? {} : { resourcesForBuild: options.resourceStoreForBuild }),
    credentials: options.credentialStore,
    operations: options.operationStore,
    actions: createActionExecutor(options.executionStore),
    refinements,
  });
  const resultWriter = createLocalResultWriter({
    ...(options.executionLogs === undefined ? {} : { executionLogs: options.executionLogs }),
    buildStore: options.buildStore,
    operationStore: options.operationStore,
    commandExecutionStore: options.commandExecutionStore,
    executionStore: options.executionStore,
    removeActiveBuild: options.removeActiveBuild,
    submissionStore: options.submissionStore,
    resourceStore: options.resourceStore,
    ...(options.resourceStoreForBuild === undefined ? {} : { resourceStoreForBuild: options.resourceStoreForBuild }),
    ...(options.clearBuildResources === undefined ? {} : { clearBuildResources: options.clearBuildResources }),
    openBuildResultRepository,
  });
  const worker = createDurableLocalWorker(driver, {
    ...(options.executionBuild === undefined ? {} : { executionBuild: options.executionBuild }),
    ...(options.executionLogs === undefined ? {} : { executionLogs: options.executionLogs }),
    stores: {
      builds: options.buildStore,
      operations: options.operationStore,
      executions: options.commandExecutionStore,
      execution: options.executionStore,
    },
    resourceStore: options.resourceStore,
    ...(options.resourceStoreForBuild === undefined ? {} : { resourceStoreForBuild: options.resourceStoreForBuild }),
    openBuildResultRepository,
    installProducerPackages,
    resultWriter,
  });
  const credentialControl = createLocalCredentialControl({
    credentialStore: options.credentialStore,
    endpoints: options.endpoints ?? [],
  });
  const control = createLocalRuntimeControl({
    ...(options.executionLogs === undefined ? {} : { executionLogs: options.executionLogs }),
    buildStore: options.buildStore,
    commandExecutionStore: options.commandExecutionStore,
    buildCatalog,
    operationStore: options.operationStore,
    executionStore: options.executionStore,
    submissionStore: options.submissionStore,
  });
  const stageAttachments = async (request: LocalBuildRequest): Promise<void> => {
    const resourceStore = options.resourceStoreForBuild?.(request.id) ?? options.resourceStore;
    const required = requiredInitialResources(request);
    for (const item of (request.attachments ?? []).filter((attachment) =>
      required.has(attachment.blob.resource))) {
      if (await resourceStore.has(item.blob.resource)) continue;
      const stream = await item.open();
      if (isStreamingResourceStore(resourceStore)) {
        await resourceStore.writeStream(item.blob, stream);
      } else {
        await resourceStore.write(item.blob, await (async () => {
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
          })());
      }
    }
  };
  const presentation = async (
    build: string,
    resultLocation: LocalBuildRequest["result"]["repository"],
    previousState?: LocalBuildSubmission["state"],
  ): Promise<LocalBuildSubmission> => {
    const [snapshot, execution] = await Promise.all([
      options.buildStore.read(build),
      options.executionStore.read(build),
    ]);
    const state = snapshot === undefined
      ? previousState
      : materializeBuild(snapshot.definition, snapshot.facts);
    assert(state !== undefined, `Build ${build} has no execution state`);
    if (execution !== undefined) {
      const view = await control.inspect(build);
      assert(view !== undefined, `Build ${build} has no active Runtime view`);
      return { id: build, state, view };
    }
    const opened = await openBuildResultRepository(resultLocation);
    try {
      const result = await opened.repository.read(build);
      assert(result?.outcome !== undefined, `Build ${build} has neither active execution nor a finished Result`);
      return {
        id: build,
        state,
        completion: result.outcome === "complete"
          ? { build, outcome: "complete" }
          : { build, outcome: result.outcome, reason: result.failure },
      };
    } finally {
      await opened.close?.();
    }
  };

  const submit = async (request: LocalBuildRequest): Promise<LocalBuildSubmission> => {
    assertOrderedBuildId(request.id);
    const resultRequest = request.result;
    const executionRequest = {
      build: request.id,
      ...(options.executionContext === undefined ? {} : { context: options.executionContext }),
      executionPackages: [...new Set(request.executionPackages ?? [])].sort(),
      result: resultRequest.repository,
    } as const;
    let prepared = false;
    try {
      await options.submissionStore.prepare(executionRequest);
      prepared = true;
      await stageAttachments(request);
      const opened = await openBuildResultRepository(resultRequest.repository);
      try {
        await opened.repository.create({
          id: request.id,
          ...(resultRequest.title === undefined ? {} : { title: resultRequest.title }),
          source: { id: projectPath(resultRequest.repository.root, request.catalog.source.path) },
          ...(request.catalog.run === undefined ? {} : {
            run: { id: projectPath(resultRequest.repository.root, request.catalog.run.path) },
          }),
          publication: request.catalog.publication,
          ...(resultRequest.resourceReferences === undefined ? {} : { resourceReferences: resultRequest.resourceReferences }),
        });
      } finally {
        await opened.close?.();
      }
      await options.submissionStore.commit({
        ...executionRequest,
        definition: request.definition,
        catalog: request.catalog,
      });
      return await presentation(request.id, resultRequest.repository);
    } catch (error) {
      if (prepared) await resultWriter.discardSubmission(request.id).catch(() => undefined);
      throw error;
    }
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
    while (follow.follow === true && "view" in result && result.view.issue === undefined) {
      if (maxWaitMs !== undefined && Date.now() - startedAt + pollIntervalMs > maxWaitMs) return result;
      await wait(pollIntervalMs, follow.signal);
      result = await presentation(request.id, request.result.repository, result.state);
    }
    return result;
  };
  return {
    ...control,
    ...credentialControl,
    ...resultWriter,
    build: runBuild,
    async workOnce(workOptions) {
      return await worker.runOnce(workOptions);
    },
    close() {
      return options.close?.();
    },
  };
}
