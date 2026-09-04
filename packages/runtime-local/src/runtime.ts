import { isAbsolute, relative, resolve, sep } from "node:path";

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
  isStreamingResourceStore,
} from "@hypit/runtime";
import { assertOrderedBuildId } from "@hypit/protocol";
import type { BlobRef, BuildDefinition } from "@hypit/protocol";
import { TypeValidatorRegistry } from "@hypit/validation";

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
  assert(relation === "" || (!relation.startsWith("..") && !isAbsolute(relation)),
    `Build Result source ${path} is outside project ${resolve(root)}`);
  return (relation || ".").split(sep).join("/");
}

function requiredInitialResources(request: LocalBuildRequest): ReadonlySet<string> {
  const definition = request.definition;
  const forwarded = new Set(request.result.forwards?.map((item) => item.output) ?? []);
  const publicOwnedRecords = request.catalog.publishedOutputs.flatMap((published) => {
    if (forwarded.has(published.ref.id)) return [];
    const binding = definition.plan.outputBindings.find((item) => item.output === published.ref.id);
    return binding === undefined ? [] : [binding.record];
  });
  const recordIds = new Set([
    ...publicOwnedRecords,
    ...definition.plan.steps.flatMap((step) => Object.values(step.inputs)),
  ]);
  const resources = new Set<string>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = value as Readonly<Record<string, unknown>>;
    if (item.kind === "blob" && typeof item.resource === "string") {
      resources.add((item as unknown as BlobRef).resource);
      return;
    }
    Object.values(item).forEach(visit);
  };
  [...definition.program.records, ...definition.initialRecords]
    .filter((record) => recordIds.has(record.id))
    .forEach((record) => visit(record.value));
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

/** Capability keys are `name@version#capability`; the registry binds by CapabilityRef. */
export function parseCapabilityKey(key: string): { readonly module: { readonly name: string; readonly version: string }; readonly name: string } {
  const match = /^(.+)@([^@#]+)#(.+)$/u.exec(key);
  if (match === null) throw new Error(`${key} is not a capability key of the form name@version#capability`);
  return { module: { name: match[1]!, version: match[2]! }, name: match[3]! };
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
  const validators = new TypeValidatorRegistry();
  for (const component of options.components ?? []) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(producers, component.producers ?? []);
  }
  for (const endpoint of options.endpoints ?? []) await endpoint.install(endpoints);
  applyEndpointBindings(endpoints, options.bindings);
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
    resources: options.resourceStore,
    ...(options.resourceStoreForBuild === undefined ? {} : { resourcesForBuild: options.resourceStoreForBuild }),
    credentials: options.credentialStore,
    operations: options.operationStore,
    validators,
  });
  const resultWriter = createLocalResultWriter({
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
    stores: {
      builds: options.buildStore,
      operations: options.operationStore,
      executions: options.commandExecutionStore,
      execution: options.executionStore,
    },
    resourceStore: options.resourceStore,
    ...(options.resourceStoreForBuild === undefined ? {} : { resourceStoreForBuild: options.resourceStoreForBuild }),
    openBuildResultRepository,
    ...(options.assertEnvironment === undefined ? {} : { assertEnvironment: options.assertEnvironment }),
    installComponentPackages,
    resultWriter,
  });
  const credentialControl = createLocalCredentialControl({
    credentialStore: options.credentialStore,
    endpoints: options.endpoints ?? [],
  });
  const control = createLocalRuntimeControl({
    buildStore: options.buildStore,
    buildCatalog,
    operationStore: options.operationStore,
    executionStore: options.executionStore,
    submissionStore: options.submissionStore,
  });
  const stageAttachments = async (request: LocalBuildRequest): Promise<void> => {
    const resourceStore = options.resourceStoreForBuild?.(request.id) ?? options.resourceStore;
    const required = requiredInitialResources(request);
    for (const item of (request.attachments ?? []).filter((attachment) =>
      required.has(attachment.artifact.resource))) {
      if (await resourceStore.has(item.artifact.resource)) continue;
      const stream = await item.open();
      if (isStreamingResourceStore(resourceStore)) {
        await resourceStore.writeStream(item.artifact, stream);
      } else {
        await resourceStore.write(item.artifact, await (async () => {
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
    const state = snapshot?.state ?? previousState;
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
        completion: {
          build,
          outcome: result.outcome,
          ...(result.failure === undefined ? {} : { reason: result.failure }),
        },
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
      componentPackages: [...new Set(request.componentPackages ?? [])].sort(),
      result: resultRequest.repository,
    } as const;
    let prepared = false;
    try {
      await options.submissionStore.prepare(executionRequest);
      prepared = true;
      await stageAttachments(request);
      const opened = await openBuildResultRepository(resultRequest.repository);
      try {
        const publishedOutputs = request.catalog.publishedOutputs.map((published) => ({
          name: published.name,
          output: published.ref.id,
        }));
        const names = new Map<string, string>();
        for (const published of publishedOutputs) {
          assert(!names.has(published.output),
            `Logical Output ${published.output} has more than one public name`);
          names.set(published.output, published.name);
        }
        const targets = request.definition.targets.map((target) => {
          const name = names.get(target.output);
          assert(name !== undefined, `Target ${target.output} is not a published Author Output`);
          return name;
        });
        await opened.repository.create({
          id: request.id,
          ...(resultRequest.title === undefined ? {} : { title: resultRequest.title }),
          source: { path: projectPath(resultRequest.repository.root, request.catalog.source.path) },
          ...(request.catalog.run === undefined ? {} : {
            run: { path: projectPath(resultRequest.repository.root, request.catalog.run.path) },
          }),
          targets,
          publishedOutputs,
          ...(resultRequest.forwards === undefined ? {} : { forwards: resultRequest.forwards }),
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
