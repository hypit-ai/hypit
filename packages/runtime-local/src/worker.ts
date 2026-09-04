import { randomUUID } from "node:crypto";
import type { BuildState } from "@hypit/protocol";
import type {
  ResourceStore,
  BuildCompletion,
  BuildExecutionSnapshot,
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
    readonly executions: import("@hypit/runtime").CommandExecutionStore;
    readonly execution: import("@hypit/runtime").BuildExecutionStore;
  };
  readonly resourceStore: ResourceStore;
  readonly resourceStoreForBuild?: (build: string) => ResourceStore;
  readonly openBuildResultRepository: NonNullable<import("./types.js").CreateLocalRuntimeOptions["openBuildResultRepository"]>;
  readonly assertEnvironment?: () => Promise<void> | void;
  readonly installComponentPackages: (specifiers: readonly string[]) => Promise<void>;
  readonly resultWriter: import("./types.js").LocalResultWriter;
};

type WorkerTurnResult = BuildExecutionSnapshot | BuildCompletion;

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
  readonly #owner: string;

  constructor(delegate: RuntimeCommandExecutor, options: LocalWorkerOptions, owner: string) {
    this.#delegate = delegate;
    this.#options = options;
    this.#owner = owner;
  }

  prepare(state: BuildState): RuntimePreparation {
    return this.#delegate.prepare(state);
  }

  async #assertRunning(build: string): Promise<void> {
    const execution = await this.#options.stores.execution.read(build);
    assert(execution?.turn?.owner === this.#owner && execution.decision === undefined,
      `Build ${build} is not owned by this Worker turn`);
    assert(execution.cancellation === undefined, `Build ${build} is being cancelled`);
  }

  async #executeOnce(
    state: BuildState,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    const store = this.#options.stores.executions;
    if (descriptor.capacityMode === "asynchronous") {
      return await this.#delegate.executeCommand(state, descriptor, context);
    }
    const begun = await store.begin(context.build, descriptor.command.id);
    if (!begun.created) {
      if (begun.receipt.status === "completed" && begun.receipt.event !== undefined) {
        return { status: "completed", event: begun.receipt.event };
      }
      const event = {
        kind: "command-failed",
        command: descriptor.command.id,
        code: "EXECUTION_UNKNOWN",
        message: `Command ${descriptor.command.id} stopped before its result was stored; the same Build will not run it again`,
      } as const;
      await store.complete(context.build, descriptor.command.id, event);
      return { status: "completed", event };
    }
    try {
      const result = await this.#delegate.executeCommand(state, descriptor, context);
      assert(result.status === "completed",
        `Immediate Command ${descriptor.command.id} returned ${result.status}`);
      await store.complete(context.build, descriptor.command.id, result.event);
      return result;
    } catch (error) {
      const event = {
        kind: "command-failed",
        command: descriptor.command.id,
        code: "EXECUTION_UNKNOWN",
        message: `Command ${descriptor.command.id} ended without a stored result: ${error instanceof Error ? error.message : String(error)}`,
      } as const;
      await store.complete(context.build, descriptor.command.id, event);
      return { status: "completed", event };
    }
  }

  async executeCommand(
    state: BuildState,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    const resources = descriptor.resources;
    await this.#assertRunning(context.build);
    if (resources.length === 0) {
      return await this.#executeOnce(state, descriptor, context);
    }
    // An asynchronous command keeps its capacity reservation while it is
    // being polled. Do not count that same build/command against itself on a
    // later execution turn; the reservation is intentionally retained until
    // the Operation reaches a terminal state.
    const reservation = (await this.#options.stores.execution.listCapacity())
      .find((item) => item.build === context.build && item.command === descriptor.command.id);
    if (reservation !== undefined) {
      const result = await this.#executeOnce(state, descriptor, context);
      if (result.status !== "pending") {
        await this.#options.stores.execution.releaseCapacity(context.build, descriptor.command.id);
      }
      return result;
    }
    const acquired = await this.#options.stores.execution.acquireCapacity({
      build: context.build,
      command: descriptor.command.id,
      resources,
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
      const result = await this.#executeOnce(state, descriptor, context);
      if (result.status !== "pending") {
        await this.#options.stores.execution.releaseCapacity(
          acquired.reservation.build,
          acquired.reservation.command,
        );
      }
      return result;
    } catch (error) {
      await this.#options.stores.execution.releaseCapacity(
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
  readonly #owner = randomUUID();

  constructor(executor: RuntimeCommandExecutor, options: LocalWorkerOptions) {
    this.#executor = executor;
    this.#options = options;
    this.#executorWithCapacity = new CapacityExecutor(executor, options, this.#owner);
  }

  async #cancel(execution: BuildExecutionSnapshot): Promise<WorkerTurnResult> {
    const snapshot = await this.#options.stores.builds.read(execution.build);
    assert(snapshot !== undefined, `Build ${execution.build} has no durable execution state`);
    const operations = await this.#options.stores.operations.list({ build: execution.build });
    const active = operations
      .filter((item) => item.status === "pending" && item.handle !== undefined);
    for (const operation of active) {
      if (this.#executor.cancelOperation !== undefined) {
        await this.#executor.cancelOperation(snapshot.state, operation).catch(() => undefined);
      } else {
        await this.#options.stores.operations.update(operation.id, { status: "cancelled" });
      }
    }
    await this.#options.stores.execution.releaseBuildCapacity(execution.build);
    const decided = await this.#options.stores.execution.decide(
      execution.build,
      this.#owner,
      "cancelled",
      execution.cancellation?.reason ?? "cancelled by Runtime",
    );
    return await this.#options.resultWriter.completeResult(decided);
  }

  async #finish(execution: BuildExecutionSnapshot, result: ScheduledBuildResult): Promise<WorkerTurnResult> {
    const current = await this.#options.stores.execution.read(execution.build);
    assert(current?.turn?.owner === this.#owner && current.decision === undefined,
      `Execution ${execution.build} is no longer owned by this Worker turn`);
    if (current.cancellation !== undefined) return await this.#cancel(current);
    if (result.status === "complete") {
      await this.#options.stores.execution.releaseBuildCapacity(execution.build);
      const decided = await this.#options.stores.execution.decide(execution.build, this.#owner, "complete");
      return await this.#options.resultWriter.completeResult(decided);
    }
    if (result.status === "failed" || result.outcomes.some((item) => item.status === "error")) {
      const reason = result.outcomes.find((item) => item.status === "error")?.message
        ?? result.state.diagnostics.at(-1)?.message
        ?? "Core Build failed";
      await this.#options.stores.execution.releaseBuildCapacity(execution.build);
      const decided = await this.#options.stores.execution.decide(execution.build, this.#owner, "failed", reason);
      return await this.#options.resultWriter.completeResult(decided);
    }
    const pending = result.outcomes.filter((item) => item.status === "pending");
    const deferred = result.outcomes.filter((item) => item.status === "deferred");
    if (pending.length === 0 && deferred.length === 0 && result.blocked.length > 0) {
      const reason = result.blocked.map((item) => `${item.reason}: ${item.subject}`).join(", ");
      await this.#options.stores.execution.releaseBuildCapacity(execution.build);
      const decided = await this.#options.stores.execution.decide(execution.build, this.#owner, "failed", reason);
      return await this.#options.resultWriter.completeResult(decided);
    }
    const now = Date.now();
    const wakeAt = Math.min(...[
      ...pending.map((item) => item.wakeAt ?? now + 1_000),
      ...deferred.map((item) => item.wakeAt ?? now + 1_000),
    ]);
    const released = await this.#options.stores.execution.releaseTurn(
      execution.build,
      this.#owner,
      Number.isFinite(wakeAt) ? wakeAt : now,
    );
    return released.cancellation === undefined ? released : await this.#cancel(released);
  }

  async #fail(execution: BuildExecutionSnapshot, error: unknown): Promise<WorkerTurnResult> {
    const current = await this.#options.stores.execution.read(execution.build);
    if (current?.cancellation !== undefined) return await this.#cancel(current);
    const reason = error instanceof Error ? error.message : String(error);
    await this.#options.stores.execution.releaseBuildCapacity(execution.build);
    const decided = await this.#options.stores.execution.decide(execution.build, this.#owner, "failed", reason);
    return await this.#options.resultWriter.completeResult(decided);
  }

  async #runClaimed(executions: readonly BuildExecutionSnapshot[]): Promise<readonly WorkerTurnResult[]> {
    const finished: WorkerTurnResult[] = [];
    const runnable: { readonly execution: BuildExecutionSnapshot; readonly snapshot: import("@hypit/runtime").BuildSnapshot }[] = [];
    for (const execution of executions) {
      assert(execution.turn?.owner === this.#owner && execution.decision === undefined,
        `Execution ${execution.build} was not claimed by this Worker turn`);
      if (execution.cancellation !== undefined) {
        finished.push(await this.#cancel(execution));
        continue;
      }
      try {
        await this.#options.installComponentPackages(execution.componentPackages);
        const snapshot = await this.#options.stores.builds.read(execution.build);
        assert(snapshot !== undefined, `Execution ${execution.build} has no Build Definition`);
        runnable.push({ execution, snapshot });
      } catch (error) {
        finished.push(await this.#fail(execution, error));
      }
    }
    if (runnable.length === 0) return finished;
    const scheduler = new LocalBuildScheduler(this.#executorWithCapacity, {
      buildStore: this.#options.stores.builds,
      onStateChange: async (build, state) => {
        const item = runnable.find((candidate) => candidate.execution.build === build);
        assert(item !== undefined, `Result update refers to unknown Build ${build}`);
        await this.#options.resultWriter.sync(item.execution, state).catch(() => undefined);
      },
    });
    try {
      const results = await scheduler.run(runnable.map(({ execution, snapshot }) => ({
        id: execution.build,
        snapshot,
      })));
      const byBuild = new Map(runnable.map((item) => [item.execution.build, item]));
      for (const result of results) {
        const item = byBuild.get(result.id);
        assert(item !== undefined, `Scheduler returned unknown Build ${result.id}`);
        finished.push(await this.#finish(item.execution, result));
      }
    } catch (error) {
      for (const item of runnable) finished.push(await this.#fail(item.execution, error));
    }
    return finished;
  }

  async runOnce(): Promise<WorkerTurnResult | undefined> {
    await this.#options.assertEnvironment?.();
    const execution = await this.#options.stores.execution.claim(this.#owner, Date.now());
    if (execution === undefined) return undefined;
    const [result] = await this.#runClaimed([execution]);
    return result;
  }

  async run(options: RuntimeWorkerRunOptions): Promise<void> {
    positive(options.idlePollMs, "Worker idlePollMs");
    const active = new Set<Promise<void>>();
    // The Runtime Host admits one Worker process. Any stored turn owner therefore belongs to the
    // previous process; clearing it changes no external fact and performs no Result action.
    await this.#options.assertEnvironment?.();
    await this.#options.stores.execution.reclaimTurns(Date.now());
    await this.#options.stores.execution.reclaimResultWrites();
    for (const execution of await this.#options.stores.execution.list()) {
      if (execution.decision !== undefined && execution.attention === undefined) {
        await this.#options.stores.execution.setAttention(execution.build, {
          step: "result",
          error: "Result writing was interrupted; run `hypit result finish <build-id>`",
        });
      }
    }
    await options.ready?.();
    try {
      while (options.signal?.aborted !== true) {
        await this.#options.assertEnvironment?.();
        while (true) {
          const execution = await this.#options.stores.execution.claim(this.#owner, Date.now());
          if (execution === undefined) break;
          let task: Promise<void>;
          task = this.#runClaimed([execution])
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
