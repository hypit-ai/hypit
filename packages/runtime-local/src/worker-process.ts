import { spawn } from "node:child_process";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
  readonly logPath: string;
};

type ProcessRecord = {
  readonly profile: string;
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
    log: join(root, "worker.log"),
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

export async function runtimeProcessStatus(
  profile: string,
  dataRoot: string,
): Promise<RuntimeProcessState> {
  const location = paths(dataRoot);
  const current = await record(profile, dataRoot);
  if (current === undefined || !alive(current.pid)) {
    return { state: "stopped", profile: resolve(profile), logPath: location.log };
  }
  return {
    state: "running",
    profile: current.profile,
    pid: current.pid,
    startedAt: current.startedAt,
    logPath: location.log,
  };
}

async function waitForReady(
  profile: string,
  dataRoot: string,
  timeoutMs: number,
): Promise<RuntimeProcessState> {
  const location = paths(dataRoot);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const state = await runtimeProcessStatus(profile, dataRoot);
    if (state.state === "stopped") {
      let log = "";
      try {
        log = await readFile(location.log, "utf8");
      } catch (error) {
        if (!nodeError(error, "ENOENT")) throw error;
      }
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
): Promise<RuntimeProcessState> {
  const current = await runtimeProcessStatus(profile, dataRoot);
  if (current.state === "running") return current;
  const absolute = resolve(profile);
  const location = paths(dataRoot);
  await mkdir(location.root, { recursive: true });
  await rm(location.ready, { force: true });
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
    pid: child.pid,
    startedAt,
  } satisfies ProcessRecord), "utf8");
  child.unref();
  await log.close();
  return await waitForReady(absolute, dataRoot, timeoutMs);
}

async function stopRuntimeProcessUnlocked(profile: string, dataRoot: string, timeoutMs: number): Promise<RuntimeProcessState> {
  const current = await record(profile, dataRoot);
  const location = paths(dataRoot);
  if (current === undefined || !alive(current.pid)) {
    await rm(location.pid, { force: true });
    await rm(location.ready, { force: true });
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
  await rm(location.pid, { force: true });
  await rm(location.ready, { force: true });
  return { state: "stopped", profile: resolve(profile), logPath: location.log };
}

export async function stopRuntimeProcess(profile: string, dataRoot: string, timeoutMs = 10_000): Promise<RuntimeProcessState> {
  return await stopRuntimeProcessUnlocked(profile, dataRoot, timeoutMs);
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
  await writeFile(resolve(path), "", "utf8");
}
