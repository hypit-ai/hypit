import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { SqliteRuntimeState } from "./sqlite-state.js";
import type { RuntimeWorkerLaunch } from "./host-api.js";
import { createRuntimeResultWriter, readRuntimeWorkerOptions, statePath } from "./config.js";

type Carrier = { readonly child: ChildProcess; readonly builds: Set<string>; readonly ready: Promise<void>;
  done: Promise<void>; exited: boolean; stopping: boolean; completed: number; rssBytes: number };

/** Owns execution-carrier lifetimes, not project implementations. */
export async function superviseBuilds(options: {
  readonly profile: string;
  readonly dataRoot: string;
  readonly readyFile: string;
  readonly owner: string;
  readonly launch: RuntimeWorkerLaunch;
  readonly signal: AbortSignal;
  readonly ready: () => Promise<void>;
}): Promise<void> {
  const { executionMemoryMb } = await readRuntimeWorkerOptions(options.profile);
  const memoryBudget = executionMemoryMb * 1024 * 1024;
  const state = new SqliteRuntimeState(statePath(options.dataRoot));
  const carriers = new Set<Carrier>();
  let accepting: Carrier | undefined;
  const considerRetirement = (carrier: Carrier): void => {
    // Retire accumulated completed work. Live work alone is not a reason to multiply
    // processes, and a cold process above the budget must still be able to accept work.
    if (accepting === carrier && carrier.completed > 0 && carrier.rssBytes >= memoryBudget) {
      accepting = undefined;
      process.stderr.write(`Executor ${carrier.child.pid}: draining at ${Math.ceil(carrier.rssBytes / 1024 / 1024)} MiB; active Builds continue in place\n`);
    }
  };
  const finishInterrupted = async (build: string, reason: string): Promise<void> => {
    const current = await state.execution.read(build);
    if (current === undefined) return;
    const decided = await state.execution.interrupt(build, reason);
    try {
      const writer = createRuntimeResultWriter(options.dataRoot);
      try { await writer.completeResult(decided); }
      finally { await writer.close(); }
    } catch (error) {
      await state.execution.setAttention(build, { step: "result", error: error instanceof Error ? error.message : String(error) });
    }
  };
  const launch = (): Carrier => {
    const child = spawn(options.launch.command, [
      ...options.launch.args, "_worker", options.profile,
      "--ready-file", options.readyFile, "--worker-owner", options.owner,
      "--execution-root", options.dataRoot,
      ...(options.launch.workerArgs ?? []),
    ], {
      stdio: ["ignore", "inherit", "inherit", "ipc"], windowsHide: true,
      // Node's CommonJS evaluation callback needs this for scoped dynamic import().
      env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-vm-modules"].filter(Boolean).join(" ") },
    });
    let detail: string | undefined;
    let ready!: () => void;
    let rejectReady!: (error: Error) => void;
    let reports = Promise.resolve();
    const carrier: Carrier = { child, builds: new Set(), ready: new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; }),
      done: Promise.resolve(), exited: false, stopping: false, completed: 0, rssBytes: 0 };
    child.on("message", (message: unknown) => {
      if (typeof message !== "object" || message === null || !("kind" in message)) return;
      if (message.kind === "executor-ready") ready();
      if ("rssBytes" in message && typeof message.rssBytes === "number" && Number.isFinite(message.rssBytes)) {
        carrier.rssBytes = message.rssBytes;
        considerRetirement(carrier);
      }
      if (message.kind === "execution-error" && "message" in message && typeof message.message === "string") detail = message.message;
      if (message.kind === "build-finished" && "build" in message && typeof message.build === "string") {
        const build = message.build;
        reports = reports.then(async () => {
          if (!carrier.builds.has(build)) throw new Error(`Unassigned Build ${build} reported completion`);
          if ("error" in message && typeof message.error === "string") await finishInterrupted(build, message.error);
          carrier.builds.delete(build);
          carrier.completed++;
          considerRetirement(carrier);
        });
        void reports.catch((error) => { detail = String(error); child.kill(); });
      }
    });
    const exited = new Promise<void>((resolve) => {
      child.once("error", (error) => { detail = error.message; rejectReady(error); });
      child.once("close", (code, signal) => {
        carrier.exited = true;
        detail ??= `Build executor exited (${signal ?? code ?? "unknown"}); create a new Build to continue`;
        rejectReady(new Error(detail)); resolve();
      });
    });
    carrier.done = exited.then(async () => {
      await reports.catch(() => undefined);
      for (const build of carrier.builds) await finishInterrupted(build, detail!);
    }).finally(() => {
      carriers.delete(carrier);
      if (accepting === carrier) accepting = undefined;
    });
    void carrier.done.catch((error) => { process.stderr.write(`Executor: ${String(error)}\n`); });
    carriers.add(carrier);
    return carrier;
  };
  try {
    await state.execution.reclaimResultWrites();
    for (const execution of await state.execution.list()) {
      if (execution.decision === undefined && execution.startedAt !== undefined) {
        await finishInterrupted(execution.build, "Build executor was lost; its code context is gone. Create a new Build to continue");
      } else if (execution.decision !== undefined) {
        // A decided Build has no work left to rerun. Result publication is an
        // idempotent Runtime responsibility, so restart recovery finishes it
        // directly instead of asking the user to mutate historical state.
        try {
          const writer = createRuntimeResultWriter(options.dataRoot);
          try { await writer.completeResult(execution); }
          finally { await writer.close(); }
        } catch (error) {
          if (await state.execution.read(execution.build) !== undefined) {
            await state.execution.setAttention(execution.build, {
              step: "result",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }
    await state.execution.reclaimActionCapacity();
    await options.ready();
    while (!options.signal.aborted) {
      for (const carrier of carriers) {
        if (carrier.builds.size !== 0 || carrier.stopping || carrier.exited) continue;
        carrier.stopping = true;
        if (carrier.child.connected) carrier.child.send({ kind: "stop-execution" }, () => undefined);
        if (accepting === carrier) accepting = undefined;
      }
      for (const build of await state.execution.listUnstarted()) {
        if (options.signal.aborted) break;
        accepting ??= launch();
        const carrier = accepting;
        try {
          await carrier.ready;
        } catch (error) {
          if (accepting === carrier) accepting = undefined;
          if (options.signal.aborted) break;
          await finishInterrupted(build, `Build executor startup failed: ${error instanceof Error ? error.message : String(error)}; create a new Build to continue`);
          continue;
        }
        if (carrier.exited) break;
        if (accepting !== carrier) continue;
        await state.execution.start(build);
        carrier.builds.add(build);
        try {
          await new Promise<void>((resolve, reject) => carrier.child.send({ kind: "start-build", build }, (error) => error ? reject(error) : resolve()));
        } catch (error) {
          await finishInterrupted(build, `Build dispatch failed: ${String(error)}; create a new Build to continue`);
          carrier.builds.delete(build);
          if (accepting === carrier) accepting = undefined;
        }
      }
      await pause(100, undefined, { signal: options.signal }).catch((error) => { if (!options.signal.aborted) throw error; });
    }
  } finally {
    for (const { child } of carriers) if (child.connected) child.send({ kind: "stop-execution" }, () => undefined);
    await Promise.allSettled([...carriers].map(({ done }) => done));
    state.close();
  }
}
