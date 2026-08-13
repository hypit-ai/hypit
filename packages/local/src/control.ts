import { isDigest } from "@narratage/protocol";
import {
  isEnumerableBuildStore,
  isManagedArtifactStore,
  isStreamingArtifactStore,
  operationCancellationRequestId,
} from "@narratage/runtime";

import type {
  CreateLocalRuntimeControlOptions,
  LocalRuntimeControl,
  ProjectLocalRuntimeControlOptions,
} from "./types.js";
import { createProjectRuntimeServices } from "./project-services.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

/** Store-only control surface shared by a full executor and read-only CLI commands. */
export function createLocalRuntimeControl(
  options: CreateLocalRuntimeControlOptions,
): LocalRuntimeControl {
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
      const [snapshot, catalog, activity] = await Promise.all([
        options.buildStore.read(build),
        buildCatalog?.read(build),
        Promise.all([
          options.operationStore.list({ build }),
          options.dispatchStore.read(build),
        ]),
      ]);
      return {
        build: snapshot,
        catalog,
        operations: activity[0],
        dispatch: activity[1],
      };
    },
    async queue() {
      const [dispatches, capacity] = await Promise.all([
        options.dispatchStore.list({ phases: ["queued", "leased", "waiting", "blocked", "settling"] }),
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
    async operation(id) {
      return await options.operationStore.read(id);
    },
    async builds() {
      return await buildCatalog?.list() ?? [];
    },
    async cancel(build, reason) {
      if (await options.dispatchStore.read(build) === undefined) return undefined;
      return await options.dispatchStore.requestCancellation(build, reason);
    },
    async cancelOperation(id, reason) {
      let current = await options.operationStore.read(id);
      if (current === undefined) return undefined;
      if (current.cancellation === undefined) {
        const requestedAt = Date.now();
        while (current.cancellation === undefined) {
          const status = current.status === "completed" || current.status === "failed" || current.status === "cancelled"
            ? "too-late" as const
            : "requested" as const;
          const written = await options.operationStore.compareAndSwap(current.id, current.revision, {
            status: "control",
            cancellation: {
              requestedAt,
              requestId: operationCancellationRequestId(current.id, requestedAt),
              status,
              attempts: 0,
            },
          });
          current = written.status === "stored" ? written.snapshot : written.current;
        }
      }
      await options.dispatchStore.wake(current.build);
      return current;
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
    close() {
      return options.close?.();
    },
  };
}

/** Assemble selected service packages, then expose only their exact durable Store facets. */
export async function createProjectLocalRuntimeControl(
  options: ProjectLocalRuntimeControlOptions,
): Promise<LocalRuntimeControl> {
  const root = options.root ?? process.cwd();
  const projectServices = await createProjectRuntimeServices(root, options);
  const services = projectServices.assembly;
  return createLocalRuntimeControl({
    buildStore: services.buildStore,
    ...(projectServices.catalog === undefined ? {} : { buildCatalog: projectServices.catalog }),
    operationStore: services.operationStore,
    dispatchStore: services.dispatchStore,
    artifactStore: services.artifactStore,
    close: projectServices.close,
  });
}
