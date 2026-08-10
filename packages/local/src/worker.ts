import { randomUUID } from "node:crypto";

import type { BuildState, Digest } from "@narratage/protocol";
import { capacityReservationId } from "@narratage/runtime";
import type {
  BuildDispatchSnapshot,
  CapacityReservation,
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

  constructor(
    delegate: RuntimeCommandExecutor,
    options: RuntimeWorkerFactoryOptions,
    build: string,
    dispatchLease: DispatchLease,
    leaseMs: number,
  ) {
    this.#delegate = delegate;
    this.#options = options;
    this.#build = build;
    this.#dispatchLease = dispatchLease;
    this.#leaseMs = leaseMs;
  }

  prepare(state: BuildState): RuntimePreparation {
    return this.#delegate.prepare(state);
  }

  async #assertAuthority(): Promise<void> {
    const dispatch = await this.#options.stores.dispatch.read(this.#build);
    assert(dispatch?.admission === "open", `Build ${this.#build} no longer admits new Operations`);
    assert(dispatch.phase === "leased" && sameLease(dispatch.lease, this.#dispatchLease),
      `Build ${this.#build} Worker lease is stale`);
  }

  async #acquire(descriptor: RuntimeRunnableCommand): Promise<CapacityReservation> {
    while (true) {
      await this.#assertAuthority();
      const now = Date.now();
      const acquired = await this.#options.stores.dispatch.acquireCapacity({
        build: this.#build,
        command: descriptor.command.id,
        lane: descriptor.lane,
        mode: descriptor.capacityMode ?? "active",
        buildLease: this.#dispatchLease,
        owner: this.#dispatchLease.owner,
        token: randomUUID(),
        now,
        leaseMs: this.#leaseMs,
        limits: {
          globalActive: positive(this.#options.scheduling.maxConcurrency ?? 1, "global active capacity"),
          laneActive: positive(
            this.#options.scheduling.laneLimits?.[descriptor.lane] ?? descriptor.maxConcurrency,
            `lane ${descriptor.lane} active capacity`,
          ),
          laneInFlight: positive(descriptor.maxInFlight ?? descriptor.maxConcurrency,
            `lane ${descriptor.lane} in-flight capacity`),
        },
      });
      if (acquired.status === "acquired") return acquired.reservation;
      await pause(Math.max(1, acquired.retryAt - now));
    }
  }

  async executeCommand(
    state: BuildState,
    commandId: string,
    context: { readonly build: string },
  ): Promise<RuntimeExecutionResult> {
    assert(context.build === this.#build, "Capacity executor received another Build identity");
    const descriptor = this.#delegate.prepare(state).runnable.find((item) => item.command.id === commandId);
    assert(descriptor !== undefined, `command ${commandId} is not currently executable`);
    const reservation = await this.#acquire(descriptor);
    const lease = reservation.active;
    assert(lease !== undefined, `Capacity reservation ${reservation.id} has no active lease`);
    try {
      const result = await this.#delegate.executeCommand(state, commandId, context);
      await this.#assertAuthority();
      await this.#options.stores.dispatch.heartbeatCapacity(reservation.id, lease, Date.now(), this.#leaseMs);
      if (result.status === "pending" && (descriptor.capacityMode ?? "active") === "recoverable") {
        await this.#options.stores.dispatch.parkCapacity(reservation.id, lease, true);
      } else {
        await this.#options.stores.dispatch.releaseCapacity(reservation.id, lease);
      }
      return result;
    } catch (error) {
      await this.#options.stores.dispatch.releaseCapacity(reservation.id, lease).catch(() => undefined);
      throw error;
    }
  }

  async cancelOperation(
    state: BuildState,
    operation: import("@narratage/runtime").OperationSnapshot,
    requestedAt: number,
  ) {
    assert(this.#delegate.cancelOperation !== undefined, "selected executor cannot cancel Operations");
    return await this.#delegate.cancelOperation(state, operation, requestedAt);
  }
}

class DurableLocalWorker implements RuntimeWorker {
  readonly #executor: RuntimeCommandExecutor;
  readonly #options: RuntimeWorkerFactoryOptions;

  constructor(executor: RuntimeCommandExecutor, options: RuntimeWorkerFactoryOptions) {
    this.#executor = executor;
    this.#options = options;
  }

  async #journal(
    kind: import("@narratage/runtime").RuntimeJournalKind,
    build: string | undefined,
    worker: string,
    detail: import("@narratage/protocol").CanonicalValue,
  ): Promise<void> {
    await this.#options.stores.journal.append({ at: Date.now(), kind, worker, ...(build === undefined ? {} : { build }), detail });
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
      const observed = await this.#executor.cancelOperation!(snapshot.state, operation, requestedAt);
      await this.#journal("operation-control", dispatch.build, lease.owner, {
        operation: observed.id,
        execution: observed.status,
        control: observed.cancellation?.status ?? "none",
      });
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

  async runOnce(options: { readonly owner: string; readonly leaseMs: number }): Promise<BuildDispatchSnapshot | undefined> {
    assert(options.owner.trim().length > 0, "Worker owner is empty");
    const leaseMs = positive(options.leaseMs, "Worker leaseMs");
    const token = randomUUID();
    const dispatch = await this.#options.stores.dispatch.claim({
      owner: options.owner,
      token,
      now: Date.now(),
      leaseMs,
    });
    if (dispatch === undefined) return undefined;
    const lease = dispatch.lease;
    assert(lease !== undefined, `claimed Dispatch ${dispatch.build} has no lease`);
    await this.#journal("dispatch-claimed", dispatch.build, options.owner, { fence: lease.fence });
    if (dispatch.admission !== "open") return await this.#cancel(dispatch, lease);
    const stored = await this.#options.stores.builds.read(dispatch.build);
    assert(stored !== undefined, `Dispatch ${dispatch.build} has no BuildState`);
    assert(stored.state.id === dispatch.core, `Dispatch ${dispatch.build} Core identity differs`);
    if (this.#options.runtimeClosure !== undefined) {
      assert(this.#options.runtimeClosure.digest === dispatch.runtimeClosure,
        `Dispatch ${dispatch.build} Runtime Closure differs`);
    }
    const controlled = new CapacityExecutor(this.#executor, this.#options, dispatch.build, lease, leaseMs);
    const scheduler = this.#options.scheduler.create(controlled, {
      ...this.#options.scheduling,
      buildStore: this.#options.stores.builds,
      ...(this.#options.runtimeClosure === undefined ? {} : { runtimeClosure: this.#options.runtimeClosure }),
    });
    let heartbeatError: unknown;
    let heartbeat = Promise.resolve();
    const timer = setInterval(() => {
      heartbeat = heartbeat.then(async () => {
        await this.#options.stores.dispatch.heartbeat(dispatch.build, lease, Date.now(), leaseMs);
      }).catch((error: unknown) => { heartbeatError = error; });
    }, Math.max(50, Math.floor(leaseMs / 3)));
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
        const terminal = await this.#options.stores.dispatch.finish(dispatch.build, lease, "complete");
        await this.#journal("dispatch-terminal", dispatch.build, options.owner, { terminal: "complete" });
        return terminal;
      }
      if (result.status === "failed" || result.journal.some((item) => item.status === "error")) {
        const reason = result.journal.find((item) => item.status === "error")?.message ?? "Core Build failed";
        const terminal = await this.#options.stores.dispatch.finish(dispatch.build, lease, "failed", reason);
        await this.#journal("dispatch-terminal", dispatch.build, options.owner, { terminal: "failed", reason });
        return terminal;
      }
      const pending = result.journal.filter((item) => item.status === "pending");
      const wakeAt = pending.length === 0
        ? Date.now()
        : Math.min(...pending.map((item) => item.wakeAt ?? Date.now() + 1_000));
      const released = await this.#options.stores.dispatch.release(dispatch.build, lease, {
        phase: pending.length > 0 ? "waiting" : result.blocked.length > 0 ? "blocked" : "queued",
        availableAt: wakeAt,
        ...(result.blocked.length === 0 ? {} : { reason: result.blocked.map((item) => item.reason).join(", ") }),
      });
      await this.#journal("dispatch-released", dispatch.build, options.owner, {
        phase: released.phase,
        availableAt: released.availableAt,
      });
      return released;
    } catch (error) {
      clearInterval(timer);
      await heartbeat;
      const current = await this.#options.stores.dispatch.read(dispatch.build);
      if (current?.phase !== "leased" || !sameLease(current.lease, lease)) throw error;
      if (current.admission !== "open") return await this.#cancel(current, lease);
      const reason = error instanceof Error ? error.message : String(error);
      const terminal = await this.#options.stores.dispatch.finish(dispatch.build, lease, "failed", reason);
      await this.#journal("dispatch-terminal", dispatch.build, options.owner, { terminal: "failed", reason });
      return terminal;
    } finally {
      clearInterval(timer);
    }
  }

  async run(options: RuntimeWorkerRunOptions): Promise<void> {
    positive(options.idlePollMs, "Worker idlePollMs");
    await this.#journal("worker-started", undefined, options.owner, {});
    try {
      while (options.signal?.aborted !== true) {
        const dispatch = await this.runOnce(options);
        if (dispatch === undefined) await pause(options.idlePollMs, options.signal).catch((error: unknown) => {
          if (options.signal?.aborted !== true) throw error;
        });
      }
    } finally {
      await this.#journal("worker-stopped", undefined, options.owner, {});
    }
  }
}

export const durableLocalWorkerFactory: RuntimeWorkerFactory = {
  create(executor, options) {
    return new DurableLocalWorker(executor, options);
  },
};
