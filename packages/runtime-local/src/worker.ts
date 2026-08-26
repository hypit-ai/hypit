import type { BuildState } from "@hypit/protocol";
import type {
  BuildDispatchSnapshot,
  RuntimeCommandExecutor,
  RuntimeExecutionResult,
  RuntimePreparation,
  RuntimeRunnableCommand,
  ScheduledBuildResult,
  RuntimeWorkerRunOptions,
} from "@hypit/runtime";
import { LocalBuildScheduler } from "@hypit/runtime";

type LocalWorkerOptions = {
  readonly stores: {
    readonly builds: import("@hypit/runtime").BuildStore;
    readonly operations: import("@hypit/runtime").OperationStore;
    readonly dispatch: import("@hypit/runtime").BuildDispatchStore;
  };
  readonly installComponentPackages: (specifiers: readonly string[]) => Promise<void>;
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
    const done = (): void => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new Error("Worker stopped"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Shares declared capacity across independently advancing Builds. */
class CapacityExecutor implements RuntimeCommandExecutor {
  readonly #delegate: RuntimeCommandExecutor;
  readonly #options: LocalWorkerOptions;

  constructor(delegate: RuntimeCommandExecutor, options: LocalWorkerOptions) {
    this.#delegate = delegate;
    this.#options = options;
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
    const resources = descriptor.resources;
    await this.#assertRunning(context.build);
    if (resources.length === 0) {
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
        await this.#options.stores.dispatch.releaseCapacity(
          acquired.reservation.build,
          acquired.reservation.command,
        );
      }
      return result;
    } catch (error) {
      await this.#options.stores.dispatch.releaseCapacity(
        acquired.reservation.build,
        acquired.reservation.command,
      ).catch(() => undefined);
      throw error;
    }
  }

  async cancelOperation(
    state: BuildState,
    operation: import("@hypit/runtime").OperationSnapshot,
  ) {
    assert(this.#delegate.cancelOperation !== undefined, "selected executor cannot cancel Operations");
    return await this.#delegate.cancelOperation(state, operation);
  }
}

class DurableLocalWorker {
  readonly #executor: RuntimeCommandExecutor;
  readonly #options: LocalWorkerOptions;
  readonly #executorWithCapacity: CapacityExecutor;

  constructor(executor: RuntimeCommandExecutor, options: LocalWorkerOptions) {
    this.#executor = executor;
    this.#options = options;
    this.#executorWithCapacity = new CapacityExecutor(executor, options);
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

  async #finish(dispatch: BuildDispatchSnapshot, result: ScheduledBuildResult): Promise<BuildDispatchSnapshot> {
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
    if (pending.length === 0 && deferred.length === 0 && result.blocked.length > 0) {
      const reason = result.blocked.map((item) => `${item.reason}: ${item.subject}`).join(", ");
      await this.#options.stores.dispatch.releaseBuildCapacity(dispatch.build);
      return await this.#options.stores.dispatch.finish(dispatch.build, "failed", reason);
    }
    const now = Date.now();
    const wakeAt = Math.min(...[
      ...pending.map((item) => item.wakeAt ?? now + 1_000),
      ...deferred.map((item) => item.wakeAt ?? now + 1_000),
    ]);
    const released = await this.#options.stores.dispatch.release(dispatch.build, {
      phase: pending.length > 0 ? "waiting" : "queued",
      availableAt: Number.isFinite(wakeAt) ? wakeAt : now,
    });
    return released.cancellation === undefined ? released : await this.#cancel(released);
  }

  async #fail(dispatch: BuildDispatchSnapshot, error: unknown): Promise<BuildDispatchSnapshot> {
    const current = await this.#options.stores.dispatch.read(dispatch.build);
    if (current?.cancellation !== undefined) return await this.#cancel(current);
    const reason = error instanceof Error ? error.message : String(error);
    await this.#options.stores.dispatch.releaseBuildCapacity(dispatch.build);
    return await this.#options.stores.dispatch.finish(dispatch.build, "failed", reason);
  }

  async #runClaimed(dispatches: readonly BuildDispatchSnapshot[]): Promise<readonly BuildDispatchSnapshot[]> {
    const finished: BuildDispatchSnapshot[] = [];
    const runnable: { readonly dispatch: BuildDispatchSnapshot; readonly snapshot: import("@hypit/runtime").BuildSnapshot }[] = [];
    for (const dispatch of dispatches) {
      if (dispatch.cancellation !== undefined) {
        finished.push(await this.#cancel(dispatch));
        continue;
      }
      try {
        await this.#options.installComponentPackages(dispatch.componentPackages);
        const snapshot = await this.#options.stores.builds.read(dispatch.build);
        assert(snapshot !== undefined, `Dispatch ${dispatch.build} has no Build Definition`);
        runnable.push({ dispatch, snapshot });
      } catch (error) {
        finished.push(await this.#fail(dispatch, error));
      }
    }
    if (runnable.length === 0) return finished;
    const scheduler = new LocalBuildScheduler(this.#executorWithCapacity, {
      buildStore: this.#options.stores.builds,
    });
    try {
      const results = await scheduler.run(runnable.map(({ dispatch, snapshot }) => ({
        id: dispatch.build,
        snapshot,
      })));
      const byBuild = new Map(runnable.map((item) => [item.dispatch.build, item]));
      for (const result of results) {
        const item = byBuild.get(result.id);
        assert(item !== undefined, `Scheduler returned unknown Build ${result.id}`);
        finished.push(await this.#finish(item.dispatch, result));
      }
    } catch (error) {
      for (const item of runnable) finished.push(await this.#fail(item.dispatch, error));
    }
    return finished;
  }

  async runOnce(): Promise<BuildDispatchSnapshot | undefined> {
    const dispatch = await this.#options.stores.dispatch.claim(Date.now());
    if (dispatch === undefined) return undefined;
    const [result] = await this.#runClaimed([dispatch]);
    return result;
  }

  async run(options: RuntimeWorkerRunOptions): Promise<void> {
    positive(options.idlePollMs, "Worker idlePollMs");
    const active = new Set<Promise<void>>();
    // A Worker that went away mid-Dispatch left it `running` and holding its lane. This Worker owns
    // the Runtime, so nothing else can be executing those: take them back before claiming anything.
    await this.#options.stores.dispatch.reclaimAbandoned(Date.now());
    try {
      while (options.signal?.aborted !== true) {
        while (true) {
          const dispatch = await this.#options.stores.dispatch.claim(Date.now());
          if (dispatch === undefined) break;
          let task: Promise<void>;
          task = this.#runClaimed([dispatch])
            .then(() => undefined)
            .finally(() => active.delete(task));
          active.add(task);
        }
        await Promise.race([
          ...active,
          pause(options.idlePollMs, options.signal),
        ]).catch((error: unknown) => {
          if (options.signal?.aborted !== true) throw error;
        });
      }
    } finally {
      await Promise.allSettled(active);
    }
  }
}

export function createDurableLocalWorker(
  executor: RuntimeCommandExecutor,
  options: LocalWorkerOptions,
) {
  return new DurableLocalWorker(executor, options);
}
