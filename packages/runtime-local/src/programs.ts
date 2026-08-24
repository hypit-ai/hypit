import { spawn } from "node:child_process";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { CapabilityRef } from "@hypit/protocol";
import type { ManagedProgram, ManagedProgramCommand, ManagedProgramState } from "@hypit/runtime-kit";

import { declaredManagedPrograms } from "./config.js";
import type { LoadRuntimeConfigOptions } from "./config.js";
import { processAlive, stopProcessTree } from "./process-control.js";

export type ManagedProgramAction =
  | "already-running"
  | "installed"
  | "started"
  | "stopped"
  | "not-ours"
  | "nothing-to-stop"
  | "unchanged";

export type ManagedProgramReport = {
  readonly id: string;
  /** Every Endpoint this program serves, so an operator sees what a restart affects. */
  readonly instances: readonly string[];
  /** What this call did. Absent when it was only asked to look. */
  readonly action?: ManagedProgramAction;
  readonly state: ManagedProgramState;
  /** Why the action fell short. Never a copy of what `state` already says. */
  readonly detail?: string;
  readonly logPath?: string;
  readonly pid?: number;
};

export type ManagedProgramProgress = {
  readonly id: string;
  readonly phase: "checking" | "installing" | "starting" | "waiting" | "ready";
};

export type ManagedProgramOptions = LoadRuntimeConfigOptions & {
  /** How long to wait for a started program to answer its probe. Default 300000. */
  readonly maxWaitMs?: number;
  /** Human-facing progress only; never changes program selection or lifecycle. */
  readonly onProgress?: (event: ManagedProgramProgress) => void;
  /** When present, operate only programs backing at least one demanded capability. */
  readonly capabilities?: readonly CapabilityRef[];
};

/** Two Endpoints may drive the same program; it is brought up once. */
function distinct(programs: readonly { instance: string; program: ManagedProgram }[]) {
  const unique = new Map<string, { program: ManagedProgram; instances: string[] }>();
  for (const item of programs) {
    const found = unique.get(item.program.id);
    if (found === undefined) unique.set(item.program.id, { program: item.program, instances: [item.instance] });
    else found.instances.push(item.instance);
  }
  return [...unique.values()];
}

function directory(root: string, program: ManagedProgram): string {
  return program.stateRoot ?? join(root, "programs", program.id);
}

const LOG_ROTATE_BYTES = 10 * 1024 * 1024;

function nodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
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

async function readPid(root: string, program: ManagedProgram): Promise<number | undefined> {
  try {
    const text = await readFile(join(directory(root, program), "process.pid"), "utf8");
    const pid = Number.parseInt(text.trim(), 10);
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error(`External program ${program.id} pid file is invalid`);
    return pid;
  } catch (error) {
    if (nodeError(error, "ENOENT")) return undefined;
    throw error;
  }
}

function run(root: string, command: ManagedProgramCommand): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const child = spawn(command.command, [...command.args], {
      cwd: command.cwd ?? root,
      env: { ...process.env, ...command.env },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", (error) => resolve({ ok: false, detail: error.message }));
    child.on("close", (code) => resolve({
      ok: code === 0,
      detail: code === 0 ? "" : (output.trim().split("\n").at(-1) ?? `exited ${code}`),
    }));
  });
}

/**
 * Poll until the program answers as itself. `down` is expected while it loads
 * weights; `mismatch` is not, and stops the wait — a program that is answering
 * with another identity will not become the right one by waiting.
 */
async function waitForReady(program: ManagedProgram, pid: number, maxWaitMs: number): Promise<ManagedProgramState> {
  const deadline = Date.now() + maxWaitMs;
  let state = await program.probe();
  while (state.state === "down" && processAlive(pid) && Date.now() < deadline) {
    await sleep(1000);
    state = await program.probe();
  }
  return state;
}

async function bringUp(
  root: string,
  program: ManagedProgram,
  instances: readonly string[],
  maxWaitMs: number,
  onProgress?: (event: ManagedProgramProgress) => void,
): Promise<ManagedProgramReport> {
  const base = { id: program.id, instances };
  onProgress?.({ id: program.id, phase: "checking" });
  const initial = await program.probe();
  if (initial.state === "ready") {
    onProgress?.({ id: program.id, phase: "ready" });
    return { ...base, action: "already-running", state: initial };
  }
  if (initial.state === "mismatch") {
    // Never start a second copy beside a program that is already answering.
    return { ...base, action: "unchanged", state: initial };
  }

  let installed = false;
  if (program.installation !== undefined) {
    const installation = await program.installation.probe();
    if (installation.state !== "ready") {
      onProgress?.({ id: program.id, phase: "installing" });
      await mkdir(directory(root, program), { recursive: true });
      for (const command of program.installation.commands) {
        const result = await run(root, command);
        if (!result.ok) {
          return { ...base, action: "unchanged", state: initial, detail: `${command.command} failed: ${result.detail}` };
        }
      }
      const after = await program.installation.probe();
      if (after.state !== "ready") {
        return { ...base, action: "unchanged", state: initial, detail: `installation is ${after.state}: ${after.detail}` };
      }
      installed = true;
    }
  }
  if (program.start === undefined) {
    // Nothing to keep running: installation was the whole job.
    const state = await program.probe();
    if (state.state === "ready") onProgress?.({ id: program.id, phase: "ready" });
    return { ...base, action: state.state === "ready" && installed ? "installed" : "unchanged", state };
  }

  onProgress?.({ id: program.id, phase: "starting" });
  await mkdir(directory(root, program), { recursive: true });
  const logPath = join(directory(root, program), "program.log");
  await rotateLog(logPath);
  const log = await open(logPath, "a");
  try {
    const child = spawn(program.start.command, [...program.start.args], {
      cwd: program.start.cwd ?? root,
      env: { ...process.env, ...program.start.env },
      shell: false,
      // Outliving this process is the point, and each platform grants that differently. POSIX
      // wants its own session. Windows already gives an unreferenced child its own lifetime, and
      // asking to detach there costs the console: a detached process has none, so every console
      // grandchild it starts is handed a fresh visible window instead. That is what a transcribing
      // program looks like when `uv` re-execs Python and Python opens a pool of workers. Taking
      // the hidden console instead leaves one console for the whole tree, and no window at all.
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", log.fd, log.fd],
    });
    child.unref();
    if (child.pid === undefined) {
      return { ...base, action: "unchanged", state: initial, detail: `${program.start.command} did not start`, logPath };
    }
    onProgress?.({ id: program.id, phase: "waiting" });
    const state = await waitForReady(program, child.pid, maxWaitMs);
    if (state.state === "ready") onProgress?.({ id: program.id, phase: "ready" });
    const alive = processAlive(child.pid);
    if (alive) await writeFile(join(directory(root, program), "process.pid"), `${child.pid}\n`);
    return {
      ...base,
      action: state.state === "ready" ? (alive ? "started" : "already-running") : "unchanged",
      state,
      ...(alive ? { pid: child.pid } : {}),
      logPath,
      ...(state.state === "ready" ? {} : {
        detail: alive ? `see ${logPath}` : `process exited; see ${logPath}`,
      }),
    };
  } finally {
    await log.close();
  }
}

/** Install when needed and start every external program the Runtime Profile implies. */
export async function bringManagedProgramsUp(
  path: string,
  options: ManagedProgramOptions = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly ManagedProgramReport[] }> {
  const { dataRoot, programs } = await declaredManagedPrograms(path, options);
  // A fresh Runtime has no data directory yet. External commands may use it as
  // their working directory, so create it before the first install/start.
  await mkdir(dataRoot, { recursive: true });
  const reports = await Promise.all(distinct(programs).map(async ({ program, instances }) =>
    await bringUp(dataRoot, program, instances, options.maxWaitMs ?? 300_000, options.onProgress)));
  return { dataRoot, programs: reports };
}

/** Stop programs whose machine-level process records say Hypit started them. */
export async function takeManagedProgramsDown(
  path: string,
  options: ManagedProgramOptions = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly ManagedProgramReport[] }> {
  const { dataRoot, programs } = await declaredManagedPrograms(path, options);
  const reports = await Promise.all(distinct(programs).map(async ({ program, instances }): Promise<ManagedProgramReport> => {
    const base = { id: program.id, instances };
    const pid = await readPid(dataRoot, program);
    if (pid === undefined || !processAlive(pid)) {
      if (pid !== undefined) await rm(join(directory(dataRoot, program), "process.pid"), { force: true });
      const state = await program.probe();
      return state.state === "down"
        ? { ...base, action: "nothing-to-stop", state }
        // Someone else's process, or one started by hand. Killing it is not this
        // command's business; saying so is.
        : { ...base, action: "not-ours", state, detail: `${program.id} is running without a Hypit process record` };
    }
    const term = await stopProcessTree(pid);
    if (term === "denied") {
      return {
        ...base,
        action: "unchanged",
        state: await program.probe(),
        pid,
        detail: `process ${pid} is running but this environment cannot stop it`,
      };
    }
    if (term === "gone") {
      await rm(join(directory(dataRoot, program), "process.pid"), { force: true });
      const state = await program.probe();
      return state.state === "down"
        ? { ...base, action: "nothing-to-stop", state }
        : { ...base, action: "not-ours", state, detail: `${program.id} is now served by another process` };
    }
    const deadline = Date.now() + 15_000;
    while (processAlive(pid) && Date.now() < deadline) await sleep(200);
    if (processAlive(pid)) {
      if (await stopProcessTree(pid, true) === "denied") {
        return {
          ...base,
          action: "unchanged",
          state: await program.probe(),
          pid,
          detail: `process ${pid} ignored graceful termination and cannot be force-stopped`,
        };
      }
      const forceDeadline = Date.now() + 2_000;
      while (processAlive(pid) && Date.now() < forceDeadline) await sleep(50);
      if (processAlive(pid)) {
        return {
          ...base,
          action: "unchanged",
          state: await program.probe(),
          pid,
          detail: `process ${pid} remained alive after forced termination`,
        };
      }
    }
    await rm(join(directory(dataRoot, program), "process.pid"), { force: true });
    return { ...base, action: "stopped", state: await program.probe(), pid };
    }));
  return { dataRoot, programs: reports };
}

/** Probe every external program without changing anything. */
export async function reportManagedPrograms(
  path: string,
  options: ManagedProgramOptions = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly ManagedProgramReport[] }> {
  const { dataRoot, programs } = await declaredManagedPrograms(path, options);
  const reports = await Promise.all(distinct(programs).map(async ({ program, instances }): Promise<ManagedProgramReport> => {
    const state = await program.probe();
    const pid = await readPid(dataRoot, program);
    const logPath = join(directory(dataRoot, program), "program.log");
    let hasLog = false;
    try {
      await stat(logPath);
      hasLog = true;
    } catch (error) {
      if (!nodeError(error, "ENOENT")) throw error;
    }
    return {
      id: program.id,
      instances,
      state,
      ...(pid !== undefined && processAlive(pid) ? { pid } : {}),
      ...(hasLog ? { logPath } : {}),
    };
  }));
  return { dataRoot, programs: reports };
}
