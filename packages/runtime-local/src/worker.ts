import { randomUUID } from "node:crypto";
import type {
  ResourceStore,
  RuntimeBuildExecution,
  RuntimeCommandExecutor,
  RuntimeExecutionResult,
  RuntimePreparation,
  RuntimeRunnableCommand,
  ScheduledBuildResult,
} from "@hypit/hypit/runtime";
import type { BuildCompletion, BuildExecutionSnapshot } from "./execution.js";
import { InProcessBuildScheduler } from "@hypit/hypit/runtime";
import { BuildMachine } from "@hypit/hypit/kernel";

type LocalWorkerOptions = {
  readonly executionBuild?: string;
  readonly executionLogs?: import("./log.js").LocalExecutionLogs;
  readonly stores: {
    readonly builds: import("@hypit/hypit/runtime").BuildStore;
    readonly operations: import("@hypit/hypit/runtime").OperationStore;
    readonly executions: import("@hypit/hypit/runtime").CommandExecutionStore;
    readonly execution: import("./execution.js").BuildExecutionStore;
  };
  readonly resourceStore: ResourceStore;
  readonly resourceStoreForBuild?: (build: string) => ResourceStore;
  readonly openBuildResultRepository: NonNullable<import("./types.js").CreateLocalRuntimeOptions["openBuildResultRepository"]>;
  readonly installProducerPackages: (specifiers: readonly string[]) => Promise<void>;
  readonly resultWriter: import("./types.js").LocalResultWriter;
};

type WorkerTurnResult = BuildExecutionSnapshot | BuildCompletion;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

  prepare(execution: RuntimeBuildExecution): RuntimePreparation {
    return this.#delegate.prepare(execution);
  }

  async completeOperation(operation: string): Promise<void> {
    await this.#delegate.completeOperation?.(operation);
  }

  async #assertRunning(build: string): Promise<void> {
    const execution = await this.#options.stores.execution.read(build);
    assert(execution?.turn?.owner === this.#owner && execution.decision === undefined,
      `Build ${build} is not owned by this Worker turn`);
    assert(execution.stop === undefined, `Build ${build} is stopping`);
  }

  async #executeOnce(
    execution: RuntimeBuildExecution,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    const store = this.#options.stores.executions;
    const recordExecution = this.#options.executionLogs === undefined ? {} : {
      recordExecution: (event: import("@hypit/hypit/runtime").ExecutionLogEvent) =>
        this.#options.executionLogs!.record(context.build, descriptor.command.id, event),
    };
    const execute = (executionContext: import("@hypit/hypit/runtime").RuntimeExecutionContext) =>
      this.#delegate.executeCommand(execution, descriptor, executionContext);
    if (descriptor.capacityMode === "asynchronous") {
      return await execute({
        ...context, ...recordExecution, releaseOperationCapacity: () => this.#options.stores.execution.releaseCapacity(context.build, descriptor.command.id),
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
      const result = await execute({
        ...context, ...recordExecution,
        reportProgress: (activity) => store.reportProgress(context.build, descriptor.command.id, activity),
      });
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
    return operation === undefined || operation.status === "queued" || operation.status === "collecting"
      || operation.status === "received" || operation.status === "completed"
      || operation.status === "failed" || operation.status === "cancelled";
  }

  async #execute(
    execution: RuntimeBuildExecution,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    const resources = descriptor.resources;
    await this.#assertRunning(context.build);
    if (descriptor.capacityMode === "asynchronous") {
      const [operation] = await this.#options.stores.operations.list({ build: context.build, command: descriptor.command.id });
      if (operation?.status === "collecting") return await this.#executeOnce(execution, descriptor, context);
    }
    if (resources.length === 0) {
      return await this.#executeOnce(execution, descriptor, context);
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
      const result = await this.#executeOnce(execution, descriptor, context);
      if (await this.#releaseAfter(result, context.build, descriptor.command.id)) {
        await this.#options.stores.execution.releaseCapacity(
          acquired.reservation.build,
          acquired.reservation.command,
        );
      }
      return result;
    } catch (error) {
      const operations = await this.#options.stores.operations.list({ build: context.build, command: descriptor.command.id });
      if (!operations.some((operation) => operation.status === "submitting" || operation.status === "running")) {
        await this.#options.stores.execution.releaseCapacity(context.build, descriptor.command.id);
      }
      throw error;
    }
  }

  async executeCommand(
    execution: RuntimeBuildExecution,
    descriptor: RuntimeRunnableCommand,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    return await this.#execute(execution, descriptor, context);
  }

  async cancelOperation(
    operation: import("@hypit/hypit/runtime").OperationSnapshot,
  ) {
    assert(this.#delegate.cancelOperation !== undefined, "selected executor cannot cancel Operations");
    return await this.#delegate.cancelOperation(operation);
  }
}

class DurableLocalWorker {
  readonly #executor: RuntimeCommandExecutor;
  readonly #options: LocalWorkerOptions;
  readonly #executorWithCapacity: CapacityExecutor;
  readonly #owner = randomUUID();
  readonly #ownedBuilds = new Set<string>();
  #buildRead = Promise.resolve();

  constructor(executor: RuntimeCommandExecutor, options: LocalWorkerOptions) {
    this.#executor = executor;
    this.#options = options;
    if (options.executionBuild !== undefined) this.#ownedBuilds.add(options.executionBuild);
    this.#executorWithCapacity = new CapacityExecutor(executor, options, this.#owner);
  }

  async #readBuild(build: string): Promise<import("@hypit/hypit/runtime").BuildSnapshot | undefined> {
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

  async #finishResult(execution: BuildExecutionSnapshot, outcome: import("./execution.js").BuildOutcome, reason?: string): Promise<WorkerTurnResult> {
    await this.#options.stores.execution.releaseBuildCapacity(execution.build);
    const decision: import("./execution.js").BuildExecutionDecision = outcome === "complete"
      ? { outcome: "complete" }
      : { outcome, reason: reason ?? (outcome === "failed" ? "Build failed" : "Build cancelled") };
    const decided = await this.#options.stores.execution.decide(execution.build, this.#owner, decision);
    return await this.#options.resultWriter.completeResult(decided);
  }

  async #finishStopped(execution: BuildExecutionSnapshot): Promise<WorkerTurnResult> {
    assert(execution.stop !== undefined, `Build ${execution.build} has no stop request`);
    const operations = await this.#options.stores.operations.list({ build: execution.build });
    const received = operations.filter((operation) => operation.status === "received");
    if (received.length > 0 || execution.stop.cause === "user-cancelled") {
      const snapshot = await this.#readBuild(execution.build);
      assert(snapshot !== undefined, `Build ${execution.build} has no execution state`);
      const machine = new BuildMachine(snapshot.definition, snapshot.facts);
      for (const operation of received) {
        let event: import("@hypit/hypit/protocol").CommandResult | undefined;
        try {
          event = await this.#executor.acceptOperation?.(machine, operation);
        } catch (error) {
          await this.#options.stores.operations.update(operation.id, {
            status: "failed", failure: { code: "INVALID_ENDPOINT_RESULT", message: error instanceof Error ? error.message : String(error) },
            endedAt: Date.now(),
          });
          continue;
        }
        if (event === undefined || event.kind === "command-failed") continue;
        const fact = machine.evaluate(event);
        if (fact !== undefined) {
          await this.#options.stores.builds.append(execution.build, fact);
          machine.commit();
          await this.#executor.completeOperation?.(operation.id);
        }
      }
      if (execution.stop.cause === "user-cancelled") {
        for (const operation of await this.#options.stores.operations.list({ build: execution.build })) {
          if (operation.status === "queued" || operation.status === "submitting"
            || operation.status === "running" || operation.status === "collecting") {
            const cancelled = await this.#executor.cancelOperation?.(operation);
            if (cancelled !== undefined) await this.#options.executionLogs?.record(operation.build, operation.command, {
              endpoint: operation.endpoint, kind: "diagnostic", level: "info",
              message: `Cancellation: ${cancelled.status === "cancelled" ? cancelled.cancellation.outcome : "unsupported"}${
                cancelled.status !== "cancelled" || cancelled.cancellation.message === undefined ? "" : `; ${cancelled.cancellation.message}`}`,
            });
          }
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
    const waiting = operations.filter((item) => item.status === "running" || item.status === "collecting");
    const commands = new Set(waiting.map((item) => item.command));
    const machine = new BuildMachine(result.definition, result.facts);
    const onlyOperations = this.#executor.prepare(machine).runnable.every((item) => commands.has(item.command.id));
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
    const runnable: { readonly execution: BuildExecutionSnapshot; readonly snapshot: import("@hypit/hypit/runtime").BuildSnapshot }[] = [];
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
            const result = await this.#executor.advanceOperation!(operation, {
              build: operation.build,
              ...(this.#options.executionLogs === undefined ? {} : {
                recordExecution: (event: import("@hypit/hypit/runtime").ExecutionLogEvent) =>
                  this.#options.executionLogs!.record(operation.build, operation.command, event),
              }),
            });
            if (result.status !== "submitting" && result.status !== "running") {
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
          if (advanced.every((item) => item.status === "queued" || item.status === "submitting"
            || item.status === "running" || item.status === "collecting")) {
            const wake = Math.min(...advanced.flatMap((item) =>
              (item.status === "queued" || item.status === "running" || item.status === "collecting")
                && item.wakeAt !== undefined ? [item.wakeAt] : []));
            finished.push(await this.#options.stores.execution.releaseTurn(execution.build, this.#owner,
              Number.isFinite(wake) ? wake : undefined, execution.operationWait));
            continue;
          }
        }
        await this.#options.installProducerPackages(execution.executionPackages);
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
    const scheduler = new InProcessBuildScheduler(this.#executorWithCapacity, {
      buildStore: this.#options.stores.builds,
      onStateChange: async (build, state) => {
        const item = runnable.find((candidate) => candidate.execution.build === build);
        assert(item !== undefined, `Result update refers to unknown Build ${build}`);
        await this.#options.resultWriter.sync(item.execution, state.records).catch(() => undefined);
      },
    });
    try {
      const results = await scheduler.run(runnable.map(({ execution, snapshot }) => ({
        id: execution.build,
        definition: snapshot.definition,
        facts: snapshot.facts,
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

  async runOnce(options: { readonly build?: string; readonly hydrated?: () => void } = {}): Promise<WorkerTurnResult | undefined> {
    const store = this.#options.stores.execution;
    const assigned = this.#options.executionBuild;
    if (assigned !== undefined && options.build !== undefined && options.build !== assigned) {
      throw new Error(`This execution context belongs to Build ${assigned}, not ${options.build}`);
    }
    const selected = options.build ?? assigned;
    for (const build of selected === undefined ? await store.listReady() : [selected]) {
      const current = await store.read(build);
      if (current === undefined || current.decision !== undefined) continue;
      if (current.startedAt !== undefined && !this.#ownedBuilds.has(build)) {
        if (selected === undefined) continue;
        throw new Error(`Build ${build} already belongs to another execution context; create a new Build to continue`);
      }
      const execution = await store.claim(this.#owner, Date.now(), build);
      if (execution === undefined) continue;
      if (!this.#ownedBuilds.has(build)) {
        if (execution.startedAt !== undefined) {
          await store.releaseTurn(build, this.#owner, execution.wakeAt, execution.operationWait);
          throw new Error(`Build ${build} was assigned to another execution context`);
        }
        await store.start(build);
        this.#ownedBuilds.add(build);
      }
      const [result] = await this.#runClaimed([execution], options.hydrated);
      if (result !== undefined && ("outcome" in result || result.decision !== undefined)) this.#ownedBuilds.delete(build);
      return result;
    }
    return undefined;
  }


}

export function createDurableLocalWorker(
  executor: RuntimeCommandExecutor,
  options: LocalWorkerOptions,
) {
  return new DurableLocalWorker(executor, options);
}
