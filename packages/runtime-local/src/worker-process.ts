import { spawn } from "node:child_process";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type RuntimeWorkerLaunch = {
  readonly command: string;
  readonly args: readonly string[];
  readonly workerArgs?: readonly string[];
};

export type RuntimeProcessState = {
  readonly state: "running" | "stopped";
  readonly profile: string;
  readonly pid?: number;
  readonly startedAt?: number;
  readonly implementationPackages?: readonly string[];
  readonly logPath: string;
};

type ProcessRecord = {
  readonly format: "narratage.runtime-process@1";
  readonly profile: string;
  readonly pid: number;
  readonly startedAt: number;
  readonly implementationPackages: readonly string[];
};

const LOG_TAIL_BYTES = 1024 * 1024;
const LOG_ROTATE_BYTES = 10 * 1024 * 1024;

function paths(dataRoot: string) {
  const root = join(resolve(dataRoot), "worker");
  return {
    root,
    pid: join(root, "worker.json"),
    ready: join(root, "ready"),
    log: join(root, "worker.log"),
    lock: join(root, "lifecycle.lock"),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // POSIX uses EPERM when the process exists but the caller may not signal it.
    // Treat only an absent process as stopped; otherwise a restricted shell can
    // make every CLI invocation launch another Worker for the same Profile.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

async function withLifecycleLock<T>(dataRoot: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  const location = paths(dataRoot);
  await mkdir(location.root, { recursive: true });
  const deadline = Date.now() + timeoutMs;
  while (true) {
    let lock;
    try {
      lock = await open(location.lock, "wx");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      const owner = await readFile(location.lock, "utf8").then((text) => JSON.parse(text) as {
        readonly pid?: unknown;
      }).catch(() => undefined);
      if (owner === undefined || !Number.isSafeInteger(owner.pid) || !alive(owner.pid as number)) {
        await unlink(location.lock).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Runtime lifecycle is busy in process ${String(owner.pid)}; lock: ${location.lock}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      continue;
    }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }), "utf8");
      return await run();
    } finally {
      await lock.close();
      await unlink(location.lock).catch(() => undefined);
    }
  }
}

async function rotateLog(path: string): Promise<void> {
  const size = await stat(path).then((value) => value.size).catch(() => 0);
  if (size <= LOG_ROTATE_BYTES) return;
  const previous = `${path}.previous`;
  await unlink(previous).catch(() => undefined);
  await rename(path, previous);
}

async function record(profile: string, dataRoot: string): Promise<ProcessRecord | undefined> {
  const path = paths(dataRoot).pid;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as ProcessRecord;
    if (value.format !== "narratage.runtime-process@1" || value.profile !== resolve(profile)
      || !Number.isSafeInteger(value.pid) || value.pid < 1
      || !Array.isArray(value.implementationPackages)
      || !value.implementationPackages.every((item) => typeof item === "string" && item.length > 0)) return undefined;
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function runtimeProcessStatus(
  profile: string,
  dataRoot: string,
  requiredImplementationPackages: readonly string[] = [],
): Promise<RuntimeProcessState> {
  const location = paths(dataRoot);
  const current = await record(profile, dataRoot);
  if (current === undefined || !alive(current.pid)) {
    return { state: "stopped", profile: resolve(profile), logPath: location.log };
  }
  const currentPackages = new Set(current.implementationPackages);
  if (requiredImplementationPackages.some((item) => !currentPackages.has(item))) {
    return { state: "stopped", profile: current.profile, logPath: location.log };
  }
  return {
    state: "running",
    profile: current.profile,
    pid: current.pid,
    startedAt: current.startedAt,
    implementationPackages: current.implementationPackages,
    logPath: location.log,
  };
}

async function waitForReady(
  profile: string,
  dataRoot: string,
  timeoutMs: number,
  implementationPackages: readonly string[],
): Promise<RuntimeProcessState> {
  const location = paths(dataRoot);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const state = await runtimeProcessStatus(profile, dataRoot, implementationPackages);
    if (state.state === "stopped") {
      const log = await readFile(location.log, "utf8").catch(() => "");
      throw new Error(`Runtime Worker exited before becoming ready${log.length === 0 ? "" : `: ${log.trim().split("\n").at(-1)}`}`);
    }
    if (await exists(location.ready)) return state;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`Runtime Worker did not become ready within ${timeoutMs}ms; log: ${location.log}`);
}

export async function ensureRuntimeProcess(
  profile: string,
  dataRoot: string,
  launch: RuntimeWorkerLaunch,
  timeoutMs = 10_000,
  implementationPackages: readonly string[] = [],
): Promise<RuntimeProcessState> {
  return await withLifecycleLock(dataRoot, timeoutMs, async () => {
    const selectedPackages = [...new Set(implementationPackages)].sort();
    const existing = await record(profile, dataRoot);
    const current = await runtimeProcessStatus(profile, dataRoot, selectedPackages);
    if (current.state === "running") return current;
    if (existing !== undefined && alive(existing.pid)) {
      await stopRuntimeProcessUnlocked(profile, dataRoot, timeoutMs);
    }
    const absolute = resolve(profile);
    const location = paths(dataRoot);
    await mkdir(location.root, { recursive: true });
    await unlink(location.ready).catch(() => undefined);
    await rotateLog(location.log);
    const log = await open(location.log, "a");
    const child = spawn(launch.command, [
      ...launch.args,
      "_worker",
      absolute,
      "--ready-file",
      location.ready,
      ...(launch.workerArgs ?? []),
    ], {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
      env: process.env,
    });
    if (child.pid === undefined) throw new Error("Runtime Worker process has no pid");
    const startedAt = Date.now();
    await writeFile(location.pid, JSON.stringify({
      format: "narratage.runtime-process@1",
      profile: absolute,
      pid: child.pid,
      startedAt,
      implementationPackages: selectedPackages,
    } satisfies ProcessRecord), "utf8");
    child.unref();
    await log.close();
    return await waitForReady(absolute, dataRoot, timeoutMs, selectedPackages);
  });
}

async function stopRuntimeProcessUnlocked(profile: string, dataRoot: string, timeoutMs: number): Promise<RuntimeProcessState> {
  const current = await record(profile, dataRoot);
  const location = paths(dataRoot);
  if (current === undefined || !alive(current.pid)) {
    await unlink(location.pid).catch(() => undefined);
    await unlink(location.ready).catch(() => undefined);
    return { state: "stopped", profile: resolve(profile), logPath: location.log };
  }
  try {
    process.kill(current.pid, "SIGTERM");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      throw new Error(
        `Runtime Worker ${current.pid} is running but this environment cannot stop it; profile: ${resolve(profile)}`,
      );
    }
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline && alive(current.pid)) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (alive(current.pid)) throw new Error(`Runtime Worker ${current.pid} did not stop within ${timeoutMs}ms`);
  await unlink(location.pid).catch(() => undefined);
  await unlink(location.ready).catch(() => undefined);
  return { state: "stopped", profile: resolve(profile), logPath: location.log };
}

export async function stopRuntimeProcess(profile: string, dataRoot: string, timeoutMs = 10_000): Promise<RuntimeProcessState> {
  return await withLifecycleLock(dataRoot, timeoutMs, async () =>
    await stopRuntimeProcessUnlocked(profile, dataRoot, timeoutMs));
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

export async function markRuntimeProcessReady(path: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${process.pid}\n`, "utf8");
}
