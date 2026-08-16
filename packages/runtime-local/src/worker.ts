import type { BuildState } from "@narratage/protocol";
import type {
  BuildDispatchSnapshot,
  BuildSchedulerOptions,
  CapacityResourceClaim,
  RuntimeCommandExecutor,
  RuntimeExecutionResult,
  RuntimePreparation,
  RuntimeRunnableCommand,
  RuntimeWorker,
  RuntimeExecutionStores,
  RuntimeWorkerRunOptions,
} from "@narratage/runtime";
import { LocalBuildScheduler } from "@narratage/runtime";

type LocalWorkerOptions = {
  readonly stores: RuntimeExecutionStores;
  readonly scheduling: BuildSchedulerOptions;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positive(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

async function pause(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) throw signal.reason ?? new Error("Worker stopped");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Worker stopped"));
    }, { once: true });
  });
}

type GateWaiter = {
  readonly resources: readonly CapacityResourceClaim[];
  readonly resolve: (release: () => void) => void;
};

/** One process-wide command limit shared by every Build owned by this Worker. */
class CommandGate {
  readonly #limit: number;
  readonly #overrides: Readonly<Record<string, number>>;
  readonly #activeByResource = new Map<string, number>();
  readonly #waiters: GateWaiter[] = [];
  #active = 0;

  constructor(limit: number, overrides: Readonly<Record<string, number>> = {}) {
    this.#limit = positive(limit, "Worker command concurrency");
    this.#overrides = overrides;
  }

  #canRun(resources: readonly CapacityResourceClaim[]): boolean {
    if (this.#active >= this.#limit) return false;
    return resources.every((resource) =>
      (this.#activeByResource.get(resource.id) ?? 0)
        < (this.#overrides[resource.id] ?? resource.maxActive));
  }

  #start(resources: readonly CapacityResourceClaim[]): () => void {
    this.#active += 1;
    for (const resource of resources) {
      this.#activeByResource.set(resource.id, (this.#activeByResource.get(resource.id) ?? 0) + 1);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active -= 1;
      for (const resource of resources) {
        const remaining = (this.#activeByResource.get(resource.id) ?? 1) - 1;
        if (remaining === 0) this.#activeByResource.delete(resource.id);
        else this.#activeByResource.set(resource.id, remaining);
      }
      this.#drain();
    };
  }

  #drain(): void {
    for (let index = 0; index < this.#waiters.length;) {
      const waiter = this.#waiters[index]!;
      if (!this.#canRun(waiter.resources)) {
        index += 1;
        continue;
      }
      this.#waiters.splice(index, 1);
      waiter.resolve(this.#start(waiter.resources));
    }
  }

  async acquire(resources: readonly CapacityResourceClaim[]): Promise<() => void> {
    if (this.#canRun(resources)) return this.#start(resources);
    return await new Promise<() => void>((resolve) => {
      this.#waiters.push({ resources, resolve });
    });
  }
}

/** Adds persistent in-flight limits only to asynchronous external Operations. */
class CapacityExecutor implements RuntimeCommandExecutor {
  readonly #delegate: RuntimeCommandExecutor;
  readonly #options: LocalWorkerOptions;
  readonly #gate: CommandGate;

  constructor(delegate: RuntimeCommandExecutor, options: LocalWorkerOptions, gate: CommandGate) {
    this.#delegate = delegate;
    this.#options = options;
    this.#gate = gate;
  }

  prepare(state: BuildState): RuntimePreparation {
    return this.#delegate.prepare(state);
  }

  async #assertRunning(build: string): Promise<void> {
    const dispatch = await this.#options.stores.dispatch.read(build);
    assert(dispatch?.phase === "running", `Build ${build} is not owned by the Worker`);
    assert(dispatch.cancellation === undefined, `Build ${build} is being cancelled`);
  }

  async executeCommand(
    state: BuildState,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    const resources = descriptor.resources.map((resource) => {
      const override = this.#options.scheduling.resourceLimits?.[resource.id];
      return override === undefined
        ? resource
        : { ...resource, maxActive: override, maxInFlight: override };
    });
    await this.#assertRunning(context.build);
    const releaseCommand = await this.#gate.acquire(resources);
    try {
      await this.#assertRunning(context.build);
      if (descriptor.capacityMode !== "asynchronous") {
        return await this.#delegate.executeCommand(state, descriptor, context);
      }
      const acquired = await this.#options.stores.dispatch.acquireCapacity({
        build: context.build,
        command: descriptor.command.id,
        resources,
        ...(descriptor.queue === undefined ? {} : { queue: descriptor.queue }),
        now: Date.now(),
      });
      if (acquired.status === "blocked") {
        return {
          status: "deferred",
          wakeAt: acquired.availableAt,
          reason: `${acquired.reason}:${acquired.resource}`,
        };
      }
      try {
        const result = await this.#delegate.executeCommand(state, descriptor, context);
        if (result.status !== "pending") {
          await this.#options.stores.dispatch.releaseCapacity(acquired.reservation.id);
        }
        return result;
      } catch (error) {
        await this.#options.stores.dispatch.releaseCapacity(acquired.reservation.id).catch(() => undefined);
        throw error;
      }
    } finally {
      releaseCommand();
    }
  }

  async cancelOperation(
    state: BuildState,
    operation: import("@narratage/runtime").OperationSnapshot,
  ) {
    assert(this.#delegate.cancelOperation !== undefined, "selected executor cannot cancel Operations");
    return await this.#delegate.cancelOperation(state, operation);
  }
}

class DurableLocalWorker implements RuntimeWorker {
  readonly #executor: RuntimeCommandExecutor;
  readonly #options: LocalWorkerOptions;
  readonly #executorWithCapacity: CapacityExecutor;

  constructor(executor: RuntimeCommandExecutor, options: LocalWorkerOptions) {
    this.#executor = executor;
    this.#options = options;
    this.#executorWithCapacity = new CapacityExecutor(executor, options, new CommandGate(
      options.scheduling.maxConcurrency ?? 1,
      options.scheduling.resourceLimits,
    ));
  }

  async #cancel(dispatch: BuildDispatchSnapshot): Promise<BuildDispatchSnapshot> {
    const snapshot = await this.#options.stores.builds.read(dispatch.build);
    assert(snapshot !== undefined, `Build ${dispatch.build} has no durable state`);
    const active = (await this.#options.stores.operations.list({ build: dispatch.build }))
      .filter((item) => item.status === "pending");
    for (const operation of active) {
      if (this.#executor.cancelOperation !== undefined) {
        await this.#executor.cancelOperation(snapshot.state, operation).catch(() => undefined);
      } else {
        await this.#options.stores.operations.update(operation.id, { status: "cancelled" });
      }
    }
    await this.#options.stores.dispatch.releaseBuildCapacity(dispatch.build);
    return await this.#options.stores.dispatch.finish(
      dispatch.build,
      "cancelled",
      dispatch.cancellation?.reason ?? "cancelled by Runtime",
    );
  }

  async #runClaimed(dispatch: BuildDispatchSnapshot): Promise<BuildDispatchSnapshot> {
    if (dispatch.cancellation !== undefined) return await this.#cancel(dispatch);
    const stored = await this.#options.stores.builds.read(dispatch.build);
    assert(stored !== undefined, `Dispatch ${dispatch.build} has no Build Definition`);
    const scheduler = new LocalBuildScheduler(this.#executorWithCapacity, {
      ...this.#options.scheduling,
      buildStore: this.#options.stores.builds,
    });
    try {
      const [result] = await scheduler.run([{ id: dispatch.build, state: stored.state, snapshot: stored }]);
      assert(result !== undefined, `Scheduler returned no result for ${dispatch.build}`);
      const current = await this.#options.stores.dispatch.read(dispatch.build);
      assert(current?.phase === "running", `Dispatch ${dispatch.build} is no longer running`);
      if (current.cancellation !== undefined) return await this.#cancel(current);
      if (result.status === "complete") {
        await this.#options.stores.dispatch.releaseBuildCapacity(dispatch.build);
        return await this.#options.stores.dispatch.finish(dispatch.build, "complete");
      }
      if (result.status === "failed" || result.outcomes.some((item) => item.status === "error")) {
        const reason = result.outcomes.find((item) => item.status === "error")?.message ?? "Core Build failed";
        await this.#options.stores.dispatch.releaseBuildCapacity(dispatch.build);
        return await this.#options.stores.dispatch.finish(dispatch.build, "failed", reason);
      }
      const pending = result.outcomes.filter((item) => item.status === "pending");
      const deferred = result.outcomes.filter((item) => item.status === "deferred");
      const now = Date.now();
      const wakeTimes = [
        ...pending.map((item) => item.wakeAt ?? now + 1_000),
        ...deferred.map((item) => item.wakeAt ?? now + 1_000),
      ];
      const wakeAt = wakeTimes.length === 0
        ? result.blocked.length > 0 ? Number.MAX_SAFE_INTEGER : now
        : Math.min(...wakeTimes);
      const released = await this.#options.stores.dispatch.release(dispatch.build, {
        phase: pending.length > 0
          ? "waiting"
          : result.blocked.length > 0 ? "blocked" : "queued",
        availableAt: wakeAt,
        ...(result.blocked.length === 0 ? {} : {
          reason: result.blocked.map((item) => `${item.reason}: ${item.subject}`).join(", "),
        }),
      });
      return released.cancellation === undefined ? released : await this.#cancel(released);
    } catch (error) {
      const current = await this.#options.stores.dispatch.read(dispatch.build);
      if (current?.cancellation !== undefined) return await this.#cancel(current);
      const reason = error instanceof Error ? error.message : String(error);
      await this.#options.stores.dispatch.releaseBuildCapacity(dispatch.build);
      return await this.#options.stores.dispatch.finish(dispatch.build, "failed", reason);
    }
  }

  async runOnce(): Promise<BuildDispatchSnapshot | undefined> {
    const dispatch = await this.#options.stores.dispatch.claim();
    return dispatch === undefined ? undefined : await this.#runClaimed(dispatch);
  }

  async run(options: RuntimeWorkerRunOptions): Promise<void> {
    positive(options.idlePollMs, "Worker idlePollMs");
    const active = new Set<Promise<BuildDispatchSnapshot>>();
    const maxBuilds = positive(this.#options.scheduling.maxConcurrency ?? 1, "Worker active Builds");
    const launch = (dispatch: BuildDispatchSnapshot): void => {
      const task = this.#runClaimed(dispatch);
      active.add(task);
      void task.finally(() => active.delete(task)).catch(() => undefined);
    };
    while (options.signal?.aborted !== true) {
      while (active.size < maxBuilds) {
        const dispatch = await this.#options.stores.dispatch.claim();
        if (dispatch === undefined) break;
        launch(dispatch);
      }
      if (active.size === 0) {
        await pause(options.idlePollMs, options.signal).catch((error: unknown) => {
          if (options.signal?.aborted !== true) throw error;
        });
        continue;
      }
      await Promise.race([
        ...active,
        pause(options.idlePollMs, options.signal).then(() => undefined),
      ]).catch((error: unknown) => {
        if (options.signal?.aborted !== true) throw error;
      });
    }
    await Promise.all(active);
  }
}

export function createDurableLocalWorker(
  executor: RuntimeCommandExecutor,
  options: LocalWorkerOptions,
): RuntimeWorker {
  return new DurableLocalWorker(executor, options);
}
