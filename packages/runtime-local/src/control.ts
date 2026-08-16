import { isDigest } from "@narratage/protocol";
import {
  isEnumerableBuildStore,
  isManagedArtifactStore,
  isStreamingArtifactStore,
} from "@narratage/runtime";

import type {
  CreateLocalRuntimeArchiveControlOptions,
  CreateLocalRuntimeArtifactAccessOptions,
  CreateLocalRuntimeControlOptions,
  LocalRuntimeArchiveControl,
  LocalRuntimeArtifactAccess,
  LocalRuntimeControl,
} from "./types.js";

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

/** Durable execution-state control that never opens or depends on an ArtifactStore. */
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
    close() {
      return options.close?.();
    },
  };
}

/** Explicit Artifact byte access with no dependency on execution-state Stores. */
export function createLocalRuntimeArtifactAccess(
  options: CreateLocalRuntimeArtifactAccessOptions,
): LocalRuntimeArtifactAccess {
  return {
    async readArtifact(digest) {
      return await options.artifactStore.get(digest);
    },
    async openArtifact(digest) {
      if (isStreamingArtifactStore(options.artifactStore)) return await options.artifactStore.open(digest);
      const bytes = await options.artifactStore.get(digest);
      return bytes === undefined ? undefined : (async function* () { yield bytes; })();
    },
    close() {
      return options.close?.();
    },
  };
}

/** Full maintenance control used only by execution and explicit Artifact GC. */
export function createLocalRuntimeControl(
  options: CreateLocalRuntimeControlOptions,
): LocalRuntimeControl {
  const archive = createLocalRuntimeArchiveControl(options);
  const artifacts = createLocalRuntimeArtifactAccess(options);
  return {
    ...archive,
    ...artifacts,
    async garbageCollectArtifacts(gc = {}) {
      assert(isManagedArtifactStore(options.artifactStore),
        "selected ArtifactStore does not expose explicit retention management");
      assert(isEnumerableBuildStore(options.buildStore),
        "selected BuildStore does not expose the maintenance index required for Artifact GC");
      if (gc.apply === true) {
        const active = await options.dispatchStore.list({ phases: ["queued", "running", "waiting"] });
        assert(active.length === 0,
          `Artifact GC cannot delete while ${active.length} Build${active.length === 1 ? " is" : "s are"} active`);
      }
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
