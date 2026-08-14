import { isDigest } from "@narratage/protocol";
import {
  isEnumerableBuildStore,
  isManagedArtifactStore,
  isStreamingArtifactStore,
  operationCancellationRequestId,
  verifyRuntimeServicePackage,
} from "@narratage/runtime";
import type { RuntimeService, RuntimeServicePackage } from "@narratage/runtime";

import type {
  CreateLocalRuntimeArchiveControlOptions,
  CreateLocalRuntimeArtifactAccessOptions,
  CreateLocalRuntimeControlOptions,
  LocalRuntimeArchiveControl,
  LocalRuntimeArtifactAccess,
  LocalRuntimeControl,
  ProjectLocalRuntimeArchiveControlOptions,
  ProjectLocalRuntimeArtifactAccessOptions,
  ProjectLocalRuntimeControlOptions,
} from "./types.js";
import { selectedBuildCatalog } from "./project-services.js";

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

type OpenedProjectServices = {
  readonly packages: readonly RuntimeServicePackage[];
  readonly services: ReadonlyMap<string, { readonly package: RuntimeServicePackage; readonly service: RuntimeService }>;
  close(): Promise<void>;
};

async function openProjectServices(
  options: ProjectLocalRuntimeControlOptions,
): Promise<OpenedProjectServices> {
  const packages = [...options.runtimeServices];
  const services = new Map<string, { readonly package: RuntimeServicePackage; readonly service: RuntimeService }>();
  try {
    for (const item of packages) {
      verifyRuntimeServicePackage(item);
      for (const service of item.services) {
        assert(!services.has(service.instance.id), `Runtime service instance ${service.instance.id} is configured twice`);
        services.set(service.instance.id, { package: item, service });
      }
    }
    let closed = false;
    return {
      packages,
      services,
      close: async () => {
        if (closed) return;
        closed = true;
        for (const item of [...packages].reverse()) await item.close?.();
      },
    };
  } catch (error) {
    for (const item of [...packages].reverse()) await item.close?.();
    throw error;
  }
}

function selectedService<Role extends RuntimeService["role"]>(
  opened: OpenedProjectServices,
  id: string,
  role: Role,
): Extract<RuntimeService, { readonly role: Role }> {
  const item = opened.services.get(id);
  assert(item !== undefined, `Runtime service selection refers to unknown instance ${id}`);
  assert(item.service.role === role, `Runtime service ${id} is ${item.service.role}, not ${role}`);
  return item.service as Extract<RuntimeService, { readonly role: Role }>;
}

/** Assemble only Build, Operation and Dispatch state selected by the Profile. */
export async function createProjectLocalRuntimeArchiveControl(
  options: ProjectLocalRuntimeArchiveControlOptions,
): Promise<LocalRuntimeArchiveControl> {
  const opened = await openProjectServices(options);
  try {
    const build = selectedService(opened, options.runtimeSelection.stores.build, "build-store");
    const operations = selectedService(opened, options.runtimeSelection.stores.operations, "operation-store");
    const dispatch = selectedService(opened, options.runtimeSelection.stores.dispatch, "dispatch-store");
    const catalog = selectedBuildCatalog(opened.packages, options.runtimeSelection.stores.build);
    return createLocalRuntimeArchiveControl({
      buildStore: build.service,
      ...(catalog === undefined ? {} : { buildCatalog: catalog }),
      operationStore: operations.service,
      dispatchStore: dispatch.service,
      close: opened.close,
    });
  } catch (error) {
    await opened.close();
    throw error;
  }
}

/** Assemble only the ArtifactStore selected by the Profile. */
export async function createProjectLocalRuntimeArtifactAccess(
  options: ProjectLocalRuntimeArtifactAccessOptions,
): Promise<LocalRuntimeArtifactAccess> {
  const opened = await openProjectServices(options);
  try {
    const artifacts = selectedService(opened, options.runtimeSelection.stores.artifacts, "artifact-store");
    return createLocalRuntimeArtifactAccess({ artifactStore: artifacts.service, close: opened.close });
  } catch (error) {
    await opened.close();
    throw error;
  }
}

/** Assemble all durable Stores only for execution or explicit cross-store maintenance. */
export async function createProjectLocalRuntimeControl(
  options: ProjectLocalRuntimeControlOptions,
): Promise<LocalRuntimeControl> {
  const opened = await openProjectServices(options);
  try {
    const build = selectedService(opened, options.runtimeSelection.stores.build, "build-store");
    const operations = selectedService(opened, options.runtimeSelection.stores.operations, "operation-store");
    const dispatch = selectedService(opened, options.runtimeSelection.stores.dispatch, "dispatch-store");
    const artifacts = selectedService(opened, options.runtimeSelection.stores.artifacts, "artifact-store");
    const catalog = selectedBuildCatalog(opened.packages, options.runtimeSelection.stores.build);
    return createLocalRuntimeControl({
      buildStore: build.service,
      ...(catalog === undefined ? {} : { buildCatalog: catalog }),
      operationStore: operations.service,
      dispatchStore: dispatch.service,
      artifactStore: artifacts.service,
      close: opened.close,
    });
  } catch (error) {
    await opened.close();
    throw error;
  }
}
