import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type RuntimeWorkerLaunch = {
  readonly command: string;
  readonly args: readonly string[];
};

export type RuntimeProcessState = {
  readonly state: "running" | "stopped";
  readonly profile: string;
  readonly pid?: number;
  readonly startedAt?: number;
  readonly logPath: string;
};

type ProcessRecord = {
  readonly format: "narratage.runtime-process@1";
  readonly profile: string;
  readonly pid: number;
  readonly startedAt: number;
};

function paths(profile: string) {
  const absolute = resolve(profile);
  const id = createHash("sha256").update(absolute).digest("hex").slice(0, 16);
  const root = join(dirname(absolute), ".svml", "runtime", id);
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
  } catch {
    return false;
  }
}

async function record(profile: string): Promise<ProcessRecord | undefined> {
  const path = paths(profile).pid;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as ProcessRecord;
    if (value.format !== "narratage.runtime-process@1" || value.profile !== resolve(profile)
      || !Number.isSafeInteger(value.pid) || value.pid < 1) return undefined;
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function runtimeProcessStatus(profile: string): Promise<RuntimeProcessState> {
  const location = paths(profile);
  const current = await record(profile);
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

async function waitForReady(profile: string, timeoutMs: number): Promise<RuntimeProcessState> {
  const location = paths(profile);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const state = await runtimeProcessStatus(profile);
    if (state.state === "stopped") {
      const log = await readFile(location.log, "utf8").catch(() => "");
      throw new Error(`Runtime Worker exited before becoming ready${log.length === 0 ? "" : `: ${log.trim().split("\n").at(-1)}`}`);
    }
    if (await exists(location.ready)) return state;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Runtime Worker did not become ready within ${timeoutMs}ms; log: ${location.log}`);
}

export async function ensureRuntimeProcess(
  profile: string,
  launch: RuntimeWorkerLaunch,
  timeoutMs = 10_000,
): Promise<RuntimeProcessState> {
  const current = await runtimeProcessStatus(profile);
  if (current.state === "running") return current;
  const absolute = resolve(profile);
  const location = paths(absolute);
  await mkdir(location.root, { recursive: true });
  await unlink(location.ready).catch(() => undefined);
  const log = await open(location.log, "a");
  const child = spawn(launch.command, [
    ...launch.args,
    "_worker",
    absolute,
    "--ready-file",
    location.ready,
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
  } satisfies ProcessRecord), "utf8");
  child.unref();
  await log.close();
  return await waitForReady(absolute, timeoutMs);
}

export async function stopRuntimeProcess(profile: string, timeoutMs = 10_000): Promise<RuntimeProcessState> {
  const current = await record(profile);
  const location = paths(profile);
  if (current === undefined || !alive(current.pid)) {
    await unlink(location.pid).catch(() => undefined);
    await unlink(location.ready).catch(() => undefined);
    return { state: "stopped", profile: resolve(profile), logPath: location.log };
  }
  process.kill(current.pid, "SIGTERM");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline && alive(current.pid)) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (alive(current.pid)) throw new Error(`Runtime Worker ${current.pid} did not stop within ${timeoutMs}ms`);
  await unlink(location.pid).catch(() => undefined);
  await unlink(location.ready).catch(() => undefined);
  return { state: "stopped", profile: resolve(profile), logPath: location.log };
}

export async function runtimeProcessLogs(profile: string): Promise<{ readonly path: string; readonly text: string }> {
  const path = paths(profile).log;
  return { path, text: await readFile(path, "utf8").catch(() => "") };
}

export async function markRuntimeProcessReady(path: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${process.pid}\n`, "utf8");
}
