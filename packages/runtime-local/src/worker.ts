import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
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
import { BuildMachine } from "@hypit/core";

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
    assert(execution.stop === undefined, `Build ${build} is stopping`);
  }

  async #executeOnce(
    state: BuildState,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    const store = this.#options.stores.executions;
    if (descriptor.capacityMode === "asynchronous") {
      return await this.#delegate.executeCommand(state, descriptor, {
        ...context, releaseOperationCapacity: () => this.#options.stores.execution.releaseCapacity(context.build, descriptor.command.id),
      });
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

  async #releaseAfter(result: RuntimeExecutionResult, build: string, command: string): Promise<boolean> {
    if (result.status !== "pending") return true;
    const [operation] = await this.#options.stores.operations.list({ build, command });
    return operation?.remoteEnded === true || operation?.submission === "queued";
  }

  async executeCommand(
    state: BuildState,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    const resources = descriptor.resources;
    await this.#assertRunning(context.build);
    if (descriptor.capacityMode === "asynchronous") {
      const [operation] = await this.#options.stores.operations.list({ build: context.build, command: descriptor.command.id });
      if (operation?.remoteEnded) return await this.#executeOnce(state, descriptor, context);
    }
    if (resources.length === 0) {
      return await this.#executeOnce(state, descriptor, context);
    }
    // acquireCapacity also returns the reservation already held by this command.
    const acquired = await this.#options.stores.execution.acquireCapacity({
      build: context.build,
      command: descriptor.command.id,
      resources,
      now: Date.now(),
    });
    if (acquired.status === "blocked") {
      return {
        status: "deferred",
        ...(acquired.availableAt === undefined ? {} : { wakeAt: acquired.availableAt }),
        reason: `${acquired.reason}:${acquired.resource}`,
      };
    }
    try {
      const result = await this.#executeOnce(state, descriptor, context);
      if (await this.#releaseAfter(result, context.build, descriptor.command.id)) {
        await this.#options.stores.execution.releaseCapacity(
          acquired.reservation.build,
          acquired.reservation.command,
        );
      }
      return result;
    } catch (error) {
      const operations = await this.#options.stores.operations.list({ build: context.build, command: descriptor.command.id });
      if (!operations.some((operation) => operation.status === "pending")) {
        await this.#options.stores.execution.releaseCapacity(context.build, descriptor.command.id);
      }
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
  #buildRead = Promise.resolve();

  constructor(executor: RuntimeCommandExecutor, options: LocalWorkerOptions) {
    this.#executor = executor;
    this.#options = options;
    this.#executorWithCapacity = new CapacityExecutor(executor, options, this.#owner);
  }

  async #readBuild(build: string): Promise<import("@hypit/runtime").BuildSnapshot | undefined> {
    const previous = this.#buildRead;
    let release!: () => void;
    this.#buildRead = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      // Hydrating a persisted Definition + Facts performs substantial JSON parsing on
      // Node's one JavaScript thread. Serializing only this hydration avoids a thundering
      // memory spike; work started from the snapshots remains concurrent under its own
      // declared capacity.
      return await this.#options.stores.builds.read(build);
    } finally {
      release();
    }
  }

  async #finishResult(execution: BuildExecutionSnapshot, outcome: import("@hypit/runtime").BuildOutcome, reason?: string): Promise<WorkerTurnResult> {
    await this.#options.stores.execution.releaseBuildCapacity(execution.build);
    const decided = await this.#options.stores.execution.decide(execution.build, this.#owner, outcome, reason);
    return await this.#options.resultWriter.completeResult(decided);
  }

  async #finishStopped(execution: BuildExecutionSnapshot): Promise<WorkerTurnResult> {
    assert(execution.stop !== undefined, `Build ${execution.build} has no stop request`);
    const operations = await this.#options.stores.operations.list({ build: execution.build });
    const received = operations.filter((operation) => operation.status === "pending" && operation.completion !== undefined);
    if (received.length > 0 || execution.stop.cause === "user-cancelled") {
      const snapshot = await this.#readBuild(execution.build);
      assert(snapshot !== undefined, `Build ${execution.build} has no execution state`);
      const machine = new BuildMachine(snapshot.definition, snapshot.facts);
      for (const operation of received) {
        let event: import("@hypit/protocol").CommandResult | undefined;
        try {
          event = await this.#executor.acceptOperation?.(machine.view(), operation);
        } catch (error) {
          await this.#options.stores.operations.update(operation.id, {
            status: "failed", failure: { code: "INVALID_ENDPOINT_RESULT", message: error instanceof Error ? error.message : String(error) },
          });
          continue;
        }
        if (event === undefined || event.kind === "command-failed") continue;
        const fact = machine.evaluate(event);
        if (fact !== undefined) {
          await this.#options.stores.builds.append(execution.build, fact);
          machine.commit();
        }
      }
      if (execution.stop.cause === "user-cancelled") {
        for (const operation of await this.#options.stores.operations.list({ build: execution.build })) {
          if (operation.status === "pending") await this.#executor.cancelOperation?.(machine.view(), operation);
        }
      }
    }
    return await this.#finishResult(execution,
      execution.stop.cause === "user-cancelled" ? "cancelled" : "failed", execution.stop.reason);
  }

  async #stopFailed(execution: BuildExecutionSnapshot, reason: string): Promise<WorkerTurnResult> {
    const stopped = await this.#options.stores.execution.requestStop(execution.build, { cause: "execution-failed", reason });
    return await this.#finishStopped(stopped);
  }

  async #finish(execution: BuildExecutionSnapshot, result: ScheduledBuildResult): Promise<WorkerTurnResult> {
    const current = await this.#options.stores.execution.read(execution.build);
    assert(current?.turn?.owner === this.#owner && current.decision === undefined,
      `Execution ${execution.build} is no longer owned by this Worker turn`);
    if (current.stop !== undefined) return await this.#finishStopped(current);
    if (result.status === "complete") {
      return await this.#finishResult(execution, "complete");
    }
    if (result.status === "failed" || result.outcomes.some((item) => item.status === "error")) {
      const reason = result.outcomes.find((item) => item.status === "error")?.message
        ?? result.state.diagnostics.at(-1)?.message
        ?? "Core Build failed";
      return await this.#stopFailed(execution, reason);
    }
    const pending = result.outcomes.filter((item) => item.status === "pending");
    const deferred = result.outcomes.filter((item) => item.status === "deferred");
    if (pending.length === 0 && deferred.length === 0 && result.blocked.length > 0) {
      const reason = result.blocked.map((item) => `${item.reason}: ${item.subject}`).join(", ");
      return await this.#stopFailed(execution, reason);
    }
    const wakeAt = Math.min(...[
      ...pending.flatMap((item) => item.wakeAt === undefined ? [] : [item.wakeAt]),
      ...deferred.flatMap((item) => item.wakeAt === undefined ? [] : [item.wakeAt]),
    ]);
    const operations = await this.#options.stores.operations.list({ build: execution.build });
    const waiting = operations.filter((item) => item.status === "pending" && item.request !== undefined && item.submission !== "queued");
    const commands = new Set(waiting.map((item) => item.command));
    const onlyOperations = this.#executor.prepare(result.state).runnable.every((item) => commands.has(item.command.id));
    const released = await this.#options.stores.execution.releaseTurn(
      execution.build,
      this.#owner,
      Number.isFinite(wakeAt) ? wakeAt : undefined,
      onlyOperations && waiting.length > 0 ? waiting.map((item) => item.id) : undefined,
    );
    return released;
  }

  async #fail(execution: BuildExecutionSnapshot, error: unknown): Promise<WorkerTurnResult> {
    const reason = error instanceof Error ? error.message : String(error);
    return await this.#stopFailed(execution, reason);
  }

  async #runClaimed(
    executions: readonly BuildExecutionSnapshot[],
    hydrated?: () => void,
  ): Promise<readonly WorkerTurnResult[]> {
    const finished: WorkerTurnResult[] = [];
    const runnable: { readonly execution: BuildExecutionSnapshot; readonly snapshot: import("@hypit/runtime").BuildSnapshot }[] = [];
    for (const execution of executions) {
      assert(execution.turn?.owner === this.#owner && execution.decision === undefined,
        `Execution ${execution.build} was not claimed by this Worker turn`);
      if (execution.stop !== undefined) {
        finished.push(await this.#finishStopped(execution));
        continue;
      }
      try {
        if (execution.operationWait !== undefined && this.#executor.advanceOperation !== undefined) {
          const pending = await Promise.all(execution.operationWait.map((id) => this.#options.stores.operations.read(id)));
          // Only snapshot hydration is serialized; network actions can overlap across Builds.
          hydrated?.();
          const actions = await Promise.allSettled(pending.map(async (operation) => {
            if (operation === undefined) throw new Error(`Build ${execution.build} lost a waiting Operation`);
            const result = await this.#executor.advanceOperation!(operation);
            if (result.remoteEnded || result.status !== "pending") {
              await this.#options.stores.execution.releaseCapacity(execution.build, result.command);
            }
            return result;
          }));
          const advanced = actions.map((action) => {
            if (action.status === "rejected") throw action.reason;
            return action.value;
          });
          const failed = advanced.find((item) => item.status === "failed");
          if (failed !== undefined) {
            finished.push(await this.#stopFailed(execution, failed.failure!.message));
            continue;
          }
          if (advanced.every((item) => item.status === "pending" && item.completion === undefined)) {
            const wake = Math.min(...advanced.flatMap((item) => item.wakeAt === undefined ? [] : [item.wakeAt]));
            finished.push(await this.#options.stores.execution.releaseTurn(execution.build, this.#owner,
              Number.isFinite(wake) ? wake : undefined, execution.operationWait));
            continue;
          }
        }
        await this.#options.installComponentPackages(execution.componentPackages);
        const snapshot = await this.#readBuild(execution.build);
        assert(snapshot !== undefined, `Execution ${execution.build} has no Build Definition`);
        runnable.push({ execution, snapshot });
      } catch (error) {
        finished.push(await this.#fail(execution, error));
      } finally {
        hydrated?.();
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
    await this.#options.stores.execution.reclaimActionCapacity();
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
        while (!Boolean(options.signal?.aborted)) {
          const execution = await this.#options.stores.execution.claim(this.#owner, Date.now());
          if (execution === undefined) break;
          let markHydrated!: () => void;
          const hydration = new Promise<void>((resolve) => { markHydrated = resolve; });
          let task: Promise<void>;
          task = this.#runClaimed([execution], markHydrated)
            .then(() => undefined)
            .finally(() => active.delete(task));
          active.add(task);
          // The next Build may execute concurrently, but its persisted snapshot is
          // not hydrated until this one has left the single-threaded JSON boundary.
          await Promise.race([hydration, task]);
          // Awaiting synchronous stores only drains microtasks. Let sockets, timers and
          // stop signals run before claiming another piece of ready work.
          await setImmediate();
        }
        const idle = new AbortController();
        const signal = options.signal === undefined ? idle.signal : AbortSignal.any([idle.signal, options.signal]);
        try {
          await Promise.race([...active, pause(options.idlePollMs, signal)]);
        } catch (error) {
          if (!Boolean(options.signal?.aborted)) throw error;
        } finally { idle.abort(); }

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
