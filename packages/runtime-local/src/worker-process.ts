import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { canonicalStringify } from "@hypit/protocol";

import { processAlive, stopProcessTree } from "./process-control.js";

export type RuntimeWorkerLaunch = {
  readonly command: string;
  readonly args: readonly string[];
  readonly workerArgs?: readonly string[];
};

export type RuntimeProcessState = {
  readonly state: "running" | "stopped";
  readonly configuration?: "current" | "changed";
  readonly profile: string;
  readonly pid?: number;
  readonly startedAt?: number;
  readonly logPath: string;
};

type ProcessRecord = {
  readonly profile: string;
  readonly profileConfig: string;
  readonly owner: string;
  readonly pid: number;
  readonly startedAt: number;
};

type LaunchRecord = {
  readonly pid: number;
  readonly startedAt: number;
};

const LOG_TAIL_BYTES = 1024 * 1024;
const LOG_ROTATE_BYTES = 10 * 1024 * 1024;

function nodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function paths(dataRoot: string) {
  const root = join(resolve(dataRoot), "worker");
  return {
    root,
    pid: join(root, "worker.json"),
    ready: join(root, "ready"),
    launch: join(root, "launch.lock"),
    log: join(root, "worker.log"),
  };
}

async function rotateLog(path: string): Promise<void> {
  let size = 0;
  try {
    size = (await stat(path)).size;
  } catch (error) {
    if (!nodeError(error, "ENOENT")) throw error;
  }
  if (size <= LOG_ROTATE_BYTES) return;
  const previous = `${path}.previous`;
  await rm(previous, { force: true });
  await rename(path, previous);
}

async function record(profile: string, dataRoot: string): Promise<ProcessRecord | undefined> {
  const path = paths(dataRoot).pid;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as ProcessRecord;
    if (value.profile !== resolve(profile)
      || typeof value.profileConfig !== "string" || value.profileConfig.length === 0
      || typeof value.owner !== "string" || value.owner.length === 0
      || !Number.isSafeInteger(value.pid) || value.pid < 1
      || !Number.isSafeInteger(value.startedAt) || value.startedAt < 0) {
      throw new Error(`Runtime Worker record is invalid: ${path}`);
    }
    return value;
  } catch (error) {
    if (nodeError(error, "ENOENT")) return undefined;
    throw error;
  }
}

async function profileConfig(profile: string): Promise<string> {
  return canonicalStringify(JSON.parse(await readFile(resolve(profile), "utf8")));
}

async function readyOwner(path: string): Promise<string | undefined> {
  try {
    const value = (await readFile(path, "utf8")).trim();
    return value.length === 0 ? undefined : value;
  } catch (error) {
    if (nodeError(error, "ENOENT")) return undefined;
    throw error;
  }
}

export async function runtimeProcessStatus(
  profile: string,
  dataRoot: string,
): Promise<RuntimeProcessState> {
  const location = paths(dataRoot);
  const current = await record(profile, dataRoot);
  if (current === undefined || !processAlive(current.pid)) {
    return { state: "stopped", profile: resolve(profile), logPath: location.log };
  }
  return {
    state: "running",
    configuration: current.profileConfig === await profileConfig(profile) ? "current" : "changed",
    profile: current.profile,
    pid: current.pid,
    startedAt: current.startedAt,
    logPath: location.log,
  };
}

async function acquireLaunch(path: string, timeoutMs: number): Promise<() => Promise<void>> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const file = await open(path, "wx");
      await file.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() } satisfies LaunchRecord));
      await file.close();
      return async () => await rm(path, { force: true });
    } catch (error) {
      if (!nodeError(error, "EEXIST")) throw error;
      let owner: LaunchRecord | undefined;
      try {
        owner = JSON.parse(await readFile(path, "utf8")) as LaunchRecord;
      } catch (readError) {
        if (readError instanceof SyntaxError) {
          if (Date.now() > deadline) throw new Error("Runtime Worker launch lock remained incomplete");
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
          continue;
        }
        if (!nodeError(readError, "ENOENT")) throw readError;
      }
      if (owner !== undefined && Number.isSafeInteger(owner.pid) && owner.pid > 0 && processAlive(owner.pid)) {
        if (Date.now() > deadline) throw new Error("another Runtime Worker launch did not finish in time");
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        continue;
      }
      await rm(path, { force: true });
    }
  }
}

async function waitForReady(
  profile: string,
  dataRoot: string,
  owner: string,
  timeoutMs: number,
): Promise<RuntimeProcessState> {
  const location = paths(dataRoot);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const current = await record(profile, dataRoot);
    if (current === undefined || !processAlive(current.pid)) {
      let log = "";
      try {
        log = await readFile(location.log, "utf8");
      } catch (error) {
        if (!nodeError(error, "ENOENT")) throw error;
      }
      throw new Error(`Runtime Worker exited before becoming ready${log.length === 0 ? "" : `: ${log.trim().split("\n").at(-1)}`}`);
    }
    if (current.owner !== owner) {
      throw new Error("Runtime Worker record changed while waiting for the Worker to become ready");
    }
    if (await readyOwner(location.ready) === owner) {
      return await runtimeProcessStatus(profile, dataRoot);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`Runtime Worker did not become ready within ${timeoutMs}ms; log: ${location.log}`);
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!processAlive(pid)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  return !processAlive(pid);
}

export async function ensureRuntimeProcess(
  profile: string,
  dataRoot: string,
  launch: RuntimeWorkerLaunch,
  timeoutMs = 10_000,
): Promise<RuntimeProcessState> {
  const absolute = resolve(profile);
  const location = paths(dataRoot);
  await mkdir(location.root, { recursive: true });
  const releaseLaunch = await acquireLaunch(location.launch, timeoutMs);
  try {
    const current = await runtimeProcessStatus(profile, dataRoot);
    if (current.state === "running") {
      if (current.configuration === "changed") {
        throw new Error("Runtime Profile changed while its Worker is running; stop and start the Worker to activate it");
      }
      return current;
    }
    const stale = await record(profile, dataRoot).catch(() => undefined);
    if (stale !== undefined && !processAlive(stale.pid)) {
      await rm(location.pid, { force: true });
      await rm(location.ready, { force: true });
    }
    const owner = `worker_${randomUUID()}`;
    const activeProfileConfig = await profileConfig(absolute);
    await rm(location.ready, { force: true });
    await rotateLog(location.log);
    const log = await open(location.log, "a");
    let child;
    try {
      child = spawn(launch.command, [
        ...launch.args,
        "_worker",
        absolute,
        "--ready-file",
        location.ready,
        "--worker-owner",
        owner,
        ...(launch.workerArgs ?? []),
      ], {
        cwd: process.cwd(),
        // See the managed program start in `programs.ts`: on Windows, detaching costs the console and
        // every console descendant then gets a window of its own.
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", log.fd, log.fd],
        env: process.env,
      });
      if (child.pid === undefined) throw new Error("Runtime Worker process has no pid");
      const startedAt = Date.now();
      await writeFile(location.pid, JSON.stringify({
        profile: absolute,
        profileConfig: activeProfileConfig,
        owner,
        pid: child.pid,
        startedAt,
      } satisfies ProcessRecord), "utf8");
      child.unref();
      try {
        const ready = await waitForReady(absolute, dataRoot, owner, timeoutMs);
        if (ready.configuration === "changed") {
          throw new Error("Runtime Profile changed while its Worker was starting; start it again to activate the new Profile");
        }
        return ready;
      } catch (error) {
        const stopped = await stopProcessTree(child.pid, true).catch(() => "denied" as const);
        if (stopped === "denied" || !await waitForProcessExit(child.pid, 2_000)) {
          throw new Error(
            `Runtime Worker ${child.pid} failed to become ready and is still running; stop it explicitly before retrying`,
            { cause: error },
          );
        }
        const saved = await record(profile, dataRoot).catch(() => undefined);
        if (saved?.owner === owner) {
          await rm(location.pid, { force: true });
          await rm(location.ready, { force: true });
        }
        throw error;
      }
    } finally {
      await log.close();
    }
  } finally {
    await releaseLaunch();
  }
}

async function stopRuntimeProcessUnlocked(profile: string, dataRoot: string, timeoutMs: number): Promise<RuntimeProcessState> {
  const current = await record(profile, dataRoot);
  const location = paths(dataRoot);
  if (current === undefined || !processAlive(current.pid)) {
    await rm(location.pid, { force: true });
    await rm(location.ready, { force: true });
    return { state: "stopped", profile: resolve(profile), logPath: location.log };
  }
  if (await stopProcessTree(current.pid) === "denied") {
    throw new Error(
      `Runtime Worker ${current.pid} is running but this environment cannot stop it; profile: ${resolve(profile)}`,
    );
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline && processAlive(current.pid)) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (processAlive(current.pid)) {
    if (await stopProcessTree(current.pid, true) === "denied") {
      throw new Error(`Runtime Worker ${current.pid} did not stop within ${timeoutMs}ms`);
    }
    const forceDeadline = Date.now() + 2_000;
    while (Date.now() <= forceDeadline && processAlive(current.pid)) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    if (processAlive(current.pid)) {
      throw new Error(`Runtime Worker ${current.pid} remained alive after forced termination`);
    }
  }
  await rm(location.pid, { force: true });
  await rm(location.ready, { force: true });
  return { state: "stopped", profile: resolve(profile), logPath: location.log };
}

export async function stopRuntimeProcess(profile: string, dataRoot: string, timeoutMs = 10_000): Promise<RuntimeProcessState> {
  const location = paths(dataRoot);
  await mkdir(location.root, { recursive: true });
  const releaseLaunch = await acquireLaunch(location.launch, timeoutMs);
  try {
    return await stopRuntimeProcessUnlocked(profile, dataRoot, timeoutMs);
  } finally {
    await releaseLaunch();
  }
}

export async function runtimeProcessLogs(dataRoot: string): Promise<{ readonly path: string; readonly text: string }> {
  const path = paths(dataRoot).log;
  let file;
  try {
    file = await open(path, "r");
    const metadata = await file.stat();
    const length = Math.min(metadata.size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, metadata.size - length);
    return { path, text: buffer.subarray(0, bytesRead).toString("utf8") };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { path, text: "" };
    throw error;
  } finally {
    await file?.close();
  }
}

export async function markRuntimeProcessReady(path: string, owner: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${owner}\n`, "utf8");
}
