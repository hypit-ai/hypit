import {
  isStreamingResourceStore,
} from "@hypit/runtime";

import type {
  CreateLocalRuntimeArchiveControlOptions,
  CreateLocalRuntimeResourceAccessOptions,
  LocalRuntimeArchiveControl,
  LocalRuntimeResourceAccess,
} from "./types.js";

/** Durable execution-state control that never opens or depends on a ResourceStore. */
export function createLocalRuntimeArchiveControl(
  options: CreateLocalRuntimeArchiveControlOptions,
): LocalRuntimeArchiveControl {
  const buildCatalog = options.buildCatalog;
  return {
    async activity(build) {
      const [operations, dispatch] = await Promise.all([
        options.operationStore.list({ build }),
        options.dispatchStore.read(build),
      ]);
      return { operations, dispatch };
    },
    async status(build) {
      const [snapshot, catalog, operations, dispatch] = await Promise.all([
        options.buildStore.read(build),
        buildCatalog?.read(build),
        options.operationStore.list({ build }),
        options.dispatchStore.read(build),
      ]);
      return {
        build: snapshot,
        catalog,
        operations,
        dispatch,
      };
    },
    async queue() {
      const [dispatches, capacity] = await Promise.all([
        options.dispatchStore.list({ phases: ["queued", "running", "waiting"] }),
        options.dispatchStore.listCapacity(),
      ]);
      const operationHistory = (await Promise.all(dispatches.map(async (item) =>
        await options.operationStore.list({ build: item.build })))).flat();
      return {
        dispatches,
        capacity,
        operations: operationHistory,
      };
    },
    async builds() {
      return await buildCatalog?.list() ?? [];
    },
    async cancel(build, reason) {
      if (await options.dispatchStore.read(build) === undefined) return undefined;
      return await options.dispatchStore.requestCancellation(build, reason);
    },
    close() {
      return options.close?.();
    },
  };
}

/** Explicit active-resource byte access with no dependency on execution-state Stores. */
export function createLocalRuntimeResourceAccess(
  options: CreateLocalRuntimeResourceAccessOptions,
): LocalRuntimeResourceAccess {
  return {
    async readResource(resource) {
      return await options.resourceStore.get(resource);
    },
    async openResource(resource) {
      if (isStreamingResourceStore(options.resourceStore)) return await options.resourceStore.open(resource);
      const bytes = await options.resourceStore.get(resource);
      return bytes === undefined ? undefined : (async function* () { yield bytes; })();
    },
    close() {
      return options.close?.();
    },
  };
}
