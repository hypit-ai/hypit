import type { BuildState } from "@narratage/protocol";
import type {
  BuildDispatchSnapshot,
  RuntimeCommandExecutor,
  RuntimeExecutionResult,
  RuntimePreparation,
  RuntimeRunnableCommand,
  RuntimeWorker,
  RuntimeWorkerFactory,
  RuntimeWorkerFactoryOptions,
  RuntimeWorkerRunOptions,
} from "@narratage/runtime";

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

/** Adds persistent in-flight limits only to asynchronous external Operations. */
class CapacityExecutor implements RuntimeCommandExecutor {
  readonly #delegate: RuntimeCommandExecutor;
  readonly #options: RuntimeWorkerFactoryOptions;
  readonly #build: string;

  constructor(delegate: RuntimeCommandExecutor, options: RuntimeWorkerFactoryOptions, build: string) {
    this.#delegate = delegate;
    this.#options = options;
    this.#build = build;
  }

  prepare(state: BuildState): RuntimePreparation {
    return this.#delegate.prepare(state);
  }

  async #assertRunning(): Promise<void> {
    const dispatch = await this.#options.stores.dispatch.read(this.#build);
    assert(dispatch?.phase === "running", `Build ${this.#build} is not owned by the Worker`);
    assert(dispatch.cancellation === undefined, `Build ${this.#build} is being cancelled`);
  }

  async executeCommand(
    state: BuildState,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    assert(context.build === this.#build, "Capacity executor received another Build identity");
    await this.#assertRunning();
    if (descriptor.capacityMode !== "asynchronous") {
      return await this.#delegate.executeCommand(state, descriptor, context);
    }
    const resources = descriptor.resources.map((resource) => {
      const override = this.#options.scheduling.resourceLimits?.[resource.id];
      return override === undefined
        ? resource
        : { ...resource, maxActive: override, maxInFlight: override };
    });
    const acquired = await this.#options.stores.dispatch.acquireCapacity({
      build: this.#build,
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
  readonly #options: RuntimeWorkerFactoryOptions;

  constructor(executor: RuntimeCommandExecutor, options: RuntimeWorkerFactoryOptions) {
    this.#executor = executor;
    this.#options = options;
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

  async runOnce(): Promise<BuildDispatchSnapshot | undefined> {
    const dispatch = await this.#options.stores.dispatch.claim();
    if (dispatch === undefined) return undefined;
    if (dispatch.cancellation !== undefined) return await this.#cancel(dispatch);
    const stored = await this.#options.stores.builds.read(dispatch.build);
    assert(stored !== undefined, `Dispatch ${dispatch.build} has no Build Definition`);
    const controlled = new CapacityExecutor(this.#executor, this.#options, dispatch.build);
    const scheduler = this.#options.scheduler.create(controlled, {
      ...this.#options.scheduling,
      buildStore: this.#options.stores.builds,
      runtimeClosure: this.#options.runtimeClosure,
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

  async run(options: RuntimeWorkerRunOptions): Promise<void> {
    positive(options.idlePollMs, "Worker idlePollMs");
    while (options.signal?.aborted !== true) {
      const dispatch = await this.runOnce();
      if (dispatch === undefined) await pause(options.idlePollMs, options.signal).catch((error: unknown) => {
        if (options.signal?.aborted !== true) throw error;
      });
    }
  }
}

export const durableLocalWorkerFactory: RuntimeWorkerFactory = {
  create(executor, options) {
    return new DurableLocalWorker(executor, options);
  },
};
