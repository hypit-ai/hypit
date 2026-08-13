import { randomUUID } from "node:crypto";

import type { BuildState, Digest } from "@narratage/protocol";
import { capacityReservationId } from "@narratage/runtime";
import type {
  BuildDispatchSnapshot,
  DispatchLease,
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

function sameLease(left: DispatchLease | undefined, right: DispatchLease): boolean {
  return left?.owner === right.owner && left.token === right.token && left.fence === right.fence;
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

class CapacityExecutor implements RuntimeCommandExecutor {
  readonly #delegate: RuntimeCommandExecutor;
  readonly #options: RuntimeWorkerFactoryOptions;
  readonly #build: string;
  readonly #dispatchLease: DispatchLease;
  readonly #leaseMs: number;
  readonly #suppressedCommands: ReadonlySet<string>;

  constructor(
    delegate: RuntimeCommandExecutor,
    options: RuntimeWorkerFactoryOptions,
    build: string,
    dispatchLease: DispatchLease,
    leaseMs: number,
    suppressedCommands: ReadonlySet<string> = new Set(),
  ) {
    this.#delegate = delegate;
    this.#options = options;
    this.#build = build;
    this.#dispatchLease = dispatchLease;
    this.#leaseMs = leaseMs;
    this.#suppressedCommands = suppressedCommands;
  }

  prepare(state: BuildState): RuntimePreparation {
    const prepared = this.#delegate.prepare(state);
    const suppressed = prepared.runnable.filter((item) => this.#suppressedCommands.has(item.command.id));
    return {
      state: prepared.state,
      runnable: prepared.runnable.filter((item) => !this.#suppressedCommands.has(item.command.id)),
      blocked: [
        ...prepared.blocked,
        ...suppressed.map((item) => ({
          command: item.command.id,
          reason: "the exact Operation was cancelled by Runtime control",
          subject: item.command.id,
        })),
      ],
    };
  }

  async #assertAuthority(): Promise<void> {
    const dispatch = await this.#options.stores.dispatch.read(this.#build);
    assert(dispatch?.admission === "open", `Build ${this.#build} no longer admits new Operations`);
    assert(dispatch.phase === "leased" && sameLease(dispatch.lease, this.#dispatchLease),
      `Build ${this.#build} Worker lease is stale`);
  }

  async #acquire(descriptor: RuntimeRunnableCommand) {
    await this.#assertAuthority();
    const now = Date.now();
    const resources = descriptor.resources.map((resource) => {
      const override = this.#options.scheduling.resourceLimits?.[resource.id];
      return override === undefined
        ? resource
        : { ...resource, maxActive: override, maxInFlight: override };
    });
    return await this.#options.stores.dispatch.acquireCapacity({
      build: this.#build,
      command: descriptor.command.id,
      resources,
      ...(descriptor.queue === undefined ? {} : { queue: descriptor.queue }),
      mode: descriptor.capacityMode ?? "active",
      buildLease: this.#dispatchLease,
      owner: this.#dispatchLease.owner,
      token: randomUUID(),
      now,
      leaseMs: this.#leaseMs,
      limits: {
        globalActive: positive(this.#options.scheduling.maxConcurrency ?? 1, "global active capacity"),
      },
    });
  }

  async executeCommand(
    state: BuildState,
    commandId: string,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    assert(context.build === this.#build, "Capacity executor received another Build identity");
    const descriptor = this.#delegate.prepare(state).runnable.find((item) => item.command.id === commandId);
    assert(descriptor !== undefined, `command ${commandId} is not currently executable`);
    const acquired = await this.#acquire(descriptor);
    if (acquired.status === "blocked") {
      return {
        status: "deferred",
        wakeAt: acquired.retryAt,
        reason: acquired.resource === undefined
          ? acquired.reason
          : `${acquired.reason}:${acquired.resource}`,
      };
    }
    const reservation = acquired.reservation;
    const lease = reservation.active;
    assert(lease !== undefined, `Capacity reservation ${reservation.id} has no active lease`);
    let heartbeatError: unknown;
    let heartbeat = Promise.resolve();
    const heartbeatTimer = setInterval(() => {
      heartbeat = heartbeat.then(async () => {
        await this.#options.stores.dispatch.heartbeatCapacity(
          reservation.id,
          lease,
          Date.now(),
          this.#leaseMs,
        );
      }).catch((error: unknown) => { heartbeatError = error; });
    }, Math.max(1, Math.floor(this.#leaseMs / 3)));
    try {
      const result = await this.#delegate.executeCommand(state, commandId, context);
      clearInterval(heartbeatTimer);
      await heartbeat;
      if (heartbeatError !== undefined) throw heartbeatError;
      await this.#assertAuthority();
      await this.#options.stores.dispatch.heartbeatCapacity(reservation.id, lease, Date.now(), this.#leaseMs);
      if (result.status === "pending" && (descriptor.capacityMode ?? "active") === "recoverable") {
        await this.#options.stores.dispatch.parkCapacity(reservation.id, lease, true);
      } else {
        await this.#options.stores.dispatch.releaseCapacity(reservation.id, lease);
      }
      const controlled = (await this.#options.stores.operations.list({
        build: this.#build,
        command: commandId,
      })).find((item) => item.cancellation !== undefined);
      if (controlled !== undefined) {
        return {
          status: "pending",
          operation: controlled.id,
          ...(controlled.cancellation?.retryAt === undefined ? {} : { wakeAt: controlled.cancellation.retryAt }),
        };
      }
      return result;
    } catch (error) {
      clearInterval(heartbeatTimer);
      await heartbeat;
      await this.#options.stores.dispatch.releaseCapacity(reservation.id, lease).catch(() => undefined);
      throw error;
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  async cancelOperation(
    state: BuildState,
    operation: import("@narratage/runtime").OperationSnapshot,
    requestedAt: number,
  ) {
    assert(this.#delegate.cancelOperation !== undefined, "selected executor cannot cancel Operations");
    const observed = await this.#delegate.cancelOperation(state, operation, requestedAt);
    await this.#assertAuthority();
    return observed;
  }
}

class DurableLocalWorker implements RuntimeWorker {
  readonly #executor: RuntimeCommandExecutor;
  readonly #options: RuntimeWorkerFactoryOptions;

  constructor(executor: RuntimeCommandExecutor, options: RuntimeWorkerFactoryOptions) {
    this.#executor = executor;
    this.#options = options;
  }

  async #cancel(dispatch: BuildDispatchSnapshot, lease: DispatchLease): Promise<BuildDispatchSnapshot> {
    const snapshot = await this.#options.stores.builds.read(dispatch.build);
    assert(snapshot !== undefined, `Build ${dispatch.build} has no durable state`);
    const active = (await this.#options.stores.operations.list({ build: dispatch.build }))
      .filter((item) => item.status === "created" || item.status === "pending");
    if (active.length > 0 && this.#executor.cancelOperation === undefined) {
      return await this.#options.stores.dispatch.release(dispatch.build, lease, {
        phase: "settling",
        availableAt: Date.now() + 1_000,
        reason: "cancellation awaits an Operation controller",
      });
    }
    const requestedAt = dispatch.cancellation?.requestedAt;
    assert(requestedAt !== undefined, `closing Build ${dispatch.build} has no cancellation request`);
    for (const operation of active) {
      await this.#executor.cancelOperation!(snapshot.state, operation, requestedAt);
    }
    const operations = await this.#options.stores.operations.list({ build: dispatch.build });
    const terminal = operations.filter((item) => item.status === "completed"
      || item.status === "failed" || item.status === "cancelled");
    for (const operation of terminal) {
      await this.#options.stores.dispatch.clearCapacity(
        capacityReservationId(dispatch.build, operation.command),
        dispatch.build,
        lease,
      );
    }
    const remaining = operations.filter((item) => item.status === "created" || item.status === "pending");
    if (remaining.length > 0) {
      const wakeAt = Math.min(...remaining.map((item) => item.cancellation?.retryAt
        ?? item.wakeAt ?? Date.now() + 1_000));
      return await this.#options.stores.dispatch.release(dispatch.build, lease, {
        phase: "settling",
        availableAt: wakeAt,
        reason: "cancellation is awaiting remote terminal facts",
      });
    }
    return await this.#options.stores.dispatch.finish(
      dispatch.build,
      lease,
      "cancelled",
      dispatch.cancellation?.reason ?? "cancelled by Runtime authority",
    );
  }

  async #reconcileOperationControl(
    state: BuildState,
    executor: CapacityExecutor,
    dispatch: BuildDispatchSnapshot,
    lease: DispatchLease,
    suppressed: Set<string>,
  ): Promise<void> {
    const operations = await this.#options.stores.operations.list({ build: dispatch.build });
    for (const operation of operations) {
      const control = operation.cancellation;
      if (control === undefined) continue;
      suppressed.add(operation.command);
      if (operation.status === "completed" || operation.status === "failed" || operation.status === "cancelled") {
        await this.#options.stores.dispatch.clearCapacity(
          capacityReservationId(dispatch.build, operation.command),
          dispatch.build,
          lease,
        );
        continue;
      }
      if (control.retryAt !== undefined && control.retryAt > Date.now()) continue;
      const observed = await executor.cancelOperation(state, operation, control.requestedAt);
      if (observed.status === "completed" || observed.status === "failed" || observed.status === "cancelled") {
        await this.#options.stores.dispatch.clearCapacity(
          capacityReservationId(dispatch.build, observed.command),
          dispatch.build,
          lease,
        );
      }
    }
  }

  async runOnce(options: { readonly owner: string; readonly leaseMs: number }): Promise<BuildDispatchSnapshot | undefined> {
    assert(options.owner.trim().length > 0, "Worker owner is empty");
    const leaseMs = positive(options.leaseMs, "Worker leaseMs");
    const runtimeClosure = this.#options.runtimeClosure;
    const token = randomUUID();
    const dispatch = await this.#options.stores.dispatch.claim({
      runtimeClosure: runtimeClosure.digest,
      owner: options.owner,
      token,
      now: Date.now(),
      leaseMs,
    });
    if (dispatch === undefined) return undefined;
    const lease = dispatch.lease;
    assert(lease !== undefined, `claimed Dispatch ${dispatch.build} has no lease`);
    if (dispatch.admission !== "open") return await this.#cancel(dispatch, lease);
    const stored = await this.#options.stores.builds.read(dispatch.build);
    assert(stored !== undefined, `Dispatch ${dispatch.build} has no BuildState`);
    assert(stored.state.id === dispatch.core, `Dispatch ${dispatch.build} Core identity differs`);
    assert(runtimeClosure.digest === dispatch.runtimeClosure,
      `Dispatch ${dispatch.build} Runtime Closure differs`);
    const suppressedCommands = new Set<string>();
    const controlled = new CapacityExecutor(
      this.#executor,
      this.#options,
      dispatch.build,
      lease,
      leaseMs,
      suppressedCommands,
    );
    await this.#reconcileOperationControl(stored.state, controlled, dispatch, lease, suppressedCommands);
    const scheduler = this.#options.scheduler.create(controlled, {
      ...this.#options.scheduling,
      buildStore: this.#options.stores.builds,
      runtimeClosure,
    });
    let heartbeatError: unknown;
    let heartbeat = Promise.resolve();
    const timer = setInterval(() => {
      heartbeat = heartbeat.then(async () => {
        await this.#options.stores.dispatch.heartbeat(dispatch.build, lease, Date.now(), leaseMs);
      }).catch((error: unknown) => { heartbeatError = error; });
    }, Math.max(1, Math.floor(leaseMs / 3)));
    try {
      const [result] = await scheduler.run([{ id: dispatch.build, state: stored.state }]);
      assert(result !== undefined, `Scheduler returned no result for ${dispatch.build}`);
      clearInterval(timer);
      await heartbeat;
      if (heartbeatError !== undefined) throw heartbeatError;
      const current = await this.#options.stores.dispatch.read(dispatch.build);
      assert(current?.phase === "leased" && sameLease(current.lease, lease),
        `Dispatch ${dispatch.build} lease was fenced before settlement`);
      if (current.admission !== "open") return await this.#cancel(current, lease);
      if (result.status === "complete") {
        return await this.#options.stores.dispatch.finish(dispatch.build, lease, "complete");
      }
      if (result.status === "failed" || result.outcomes.some((item) => item.status === "error")) {
        const reason = result.outcomes.find((item) => item.status === "error")?.message ?? "Core Build failed";
        return await this.#options.stores.dispatch.finish(dispatch.build, lease, "failed", reason);
      }
      const pending = result.outcomes.filter((item) => item.status === "pending");
      const deferred = result.outcomes.filter((item) => item.status === "deferred");
      const controlledOperations = (await this.#options.stores.operations.list({ build: dispatch.build }))
        .filter((item) => item.cancellation !== undefined)
        .filter((item) => item.status === "created" || item.status === "pending");
      const now = Date.now();
      const wakeTimes = [
        ...pending.map((item) => item.wakeAt ?? now + 1_000),
        ...deferred.map((item) => item.wakeAt ?? now + 1_000),
        ...controlledOperations.map((item) => item.cancellation?.status === "requested"
          && item.cancellation.retryAt === undefined
          ? now
          : item.cancellation?.retryAt ?? item.wakeAt ?? now + 1_000),
      ];
      const wakeAt = wakeTimes.length === 0
        ? result.blocked.length > 0 ? Number.MAX_SAFE_INTEGER : Date.now()
        : Math.min(...wakeTimes);
      return await this.#options.stores.dispatch.release(dispatch.build, lease, {
        phase: pending.length > 0 || controlledOperations.length > 0
          ? "waiting"
          : result.blocked.length > 0 ? "blocked" : "queued",
        availableAt: wakeAt,
        ...(result.blocked.length === 0 ? {} : {
          reason: result.blocked.map((item) => `${item.reason}: ${item.subject}`).join(", "),
        }),
      });
    } catch (error) {
      clearInterval(timer);
      await heartbeat;
      const current = await this.#options.stores.dispatch.read(dispatch.build);
      if (current?.phase !== "leased" || !sameLease(current.lease, lease)) throw error;
      if (current.admission !== "open") return await this.#cancel(current, lease);
      const reason = error instanceof Error ? error.message : String(error);
      return await this.#options.stores.dispatch.finish(dispatch.build, lease, "failed", reason);
    } finally {
      clearInterval(timer);
    }
  }

  async run(options: RuntimeWorkerRunOptions): Promise<void> {
    positive(options.idlePollMs, "Worker idlePollMs");
    while (options.signal?.aborted !== true) {
      const dispatch = await this.runOnce(options);
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
