import { spawn } from "node:child_process";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { CapabilityRef } from "@hypit/protocol";
import type { ManagedProgram, ManagedProgramCommand, ManagedProgramState } from "@hypit/runtime-kit";

import { declaredManagedPrograms } from "./config.js";
import type { LoadRuntimeConfigOptions } from "./config.js";
import { processAlive, stopProcessTree } from "./process-control.js";
import { processErrorLogPath } from "./process-logs.js";

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
  /** The configured Endpoint that declared this external program. */
  readonly endpoint: string;
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
  readonly logPath?: string;
};

export type ManagedProgramOptions = LoadRuntimeConfigOptions & {
  /** How long to wait for a started program to answer its probe. Default 300000. */
  readonly maxWaitMs?: number;
  /** Human-facing progress only; never changes program selection or lifecycle. */
  readonly onProgress?: (event: ManagedProgramProgress) => void;
  /** When present, operate only programs backing at least one demanded capability. */
  readonly capabilities?: readonly CapabilityRef[];
};

function independentPrograms(programs: readonly { instance: string; program: ManagedProgram }[]) {
  const owners = new Map<string, string>();
  for (const item of programs) {
    const found = owners.get(item.program.id);
    if (found !== undefined) {
      throw new Error(
        `Endpoints ${found} and ${item.instance} declare the same Managed Program ${item.program.id}; `
        + "each Endpoint must declare its own lifecycle identity",
      );
    }
    owners.set(item.program.id, item.instance);
  }
  return programs;
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

async function run(root: string, command: ManagedProgramCommand, logPath: string): Promise<{ ok: boolean; detail: string }> {
  const log = await open(logPath, "a+");
  try {
    const offset = (await log.stat()).size;
    const exit = await new Promise<{ code: number | null; error?: string }>((resolve) => {
      const child = spawn(command.command, [...command.args], {
        cwd: command.cwd ?? root,
        env: { ...process.env, ...command.env },
        shell: false,
        windowsHide: true,
        stdio: ["ignore", log.fd, log.fd],
      });
      child.on("error", (error) => resolve({ code: null, error: error.message }));
      child.on("close", (code) => resolve({ code }));
    });
    if (exit.code === 0) return { ok: true, detail: "" };
    const end = (await log.stat()).size;
    const start = Math.max(offset, end - 8192);
    const tail = Buffer.alloc(end - start);
    const { bytesRead } = await log.read(tail, 0, tail.length, start);
    const line = tail.subarray(0, bytesRead).toString().trim().split(/\r?\n/u).at(-1);
    return { ok: false, detail: exit.error ?? (line || `exited ${exit.code}`) };
  } finally {
    await log.close();
  }
}

/**
 * Poll until the program answers as itself. `down` is expected while it loads
 * weights; `mismatch` is not, and stops the wait — a program that is answering
 * with another identity will not become the right one by waiting.
 */
/** POSIX: its own session, and stdio already pointed at the log. */
async function startDetached(start: ManagedProgramCommand, root: string, logFd: number): Promise<number | undefined> {
  const child = spawn(start.command, [...start.args], {
    cwd: start.cwd ?? root,
    env: { ...process.env, ...start.env },
    shell: false,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  return child.pid;
}

/** A PowerShell single-quoted literal, which escapes by doubling the quote and nothing else. */
function powershellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * One command line, quoted the way the C runtime parses it back into `argv`.
 *
 * `Start-Process -ArgumentList` given an array joins its elements with a space and quotes none of
 * them, so an argument holding a space arrives as several: `node -e '<script>' <path>` reaches node
 * as `-e` followed by the first word of the script, and node exits on the syntax error. Given one
 * string it passes that string through as the command line, which is what this builds.
 */
function windowsCommandLine(args: readonly string[]): string {
  return args.map((value) => {
    if (value !== "" && !/[\s"]/u.test(value)) return value;
    // A quote is escaped by the backslashes before it, so those double; a trailing run doubles too,
    // because the closing quote would otherwise escape itself against them.
    const escaped = value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\*)$/u, "$1$1");
    return `"${escaped}"`;
  }).join(" ");
}

/**
 * Windows: a console of its own, hidden, so the launching console's destruction does not take it.
 *
 * The script travels as one `-EncodedCommand` blob, so no quoting of ours crosses a shell boundary.
 * Feeding it on stdin instead looks equivalent and is not: `-Command -` parses what it reads a
 * statement at a time, so an argument holding a newline — `node -e` with a real script in it — ends
 * the statement early and PowerShell exits having run nothing, with no process id and nothing on
 * stderr to say why. Base64 has no line structure to trip over.
 *
 * `Start-Process` refuses to send both streams to one file, so the error stream gets its own beside
 * the log; `-PassThru` reports the new process, which is the pid everything after this waits on and
 * stores.
 */
export async function startWithOwnConsole(
  start: ManagedProgramCommand,
  root: string,
  logPath: string,
): Promise<{ readonly pid?: number; readonly detail?: string }> {
  const errorPath = processErrorLogPath(logPath);
  const environment = Object.entries(start.env ?? {})
    .map(([name, value]) => `$env:${name} = ${powershellLiteral(String(value))}`).join("\n");
  const argumentList = start.args.length === 0
    ? ""
    : ` -ArgumentList ${powershellLiteral(windowsCommandLine(start.args))}`;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    environment,
    `$p = Start-Process -FilePath ${powershellLiteral(start.command)}${argumentList}`
      + ` -WorkingDirectory ${powershellLiteral(start.cwd ?? root)}`
      + ` -RedirectStandardOutput ${powershellLiteral(logPath)}`
      + ` -RedirectStandardError ${powershellLiteral(errorPath)}`
      + " -WindowStyle Hidden -PassThru",
    "[Console]::Out.Write($p.Id)",
  ].filter((line) => line.length > 0).join("\n");

  const shell = await new Promise<{ readonly out: string; readonly err: string }>((settle) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const done = (): void => {
      settle({ out: out.trim(), err: err.trim() });
      child.stdout.destroy();
      child.stderr.destroy();
    };
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { err += chunk.toString("utf8"); });
    child.on("error", (cause: Error) => { err = cause.message; done(); });
    // `close` waits for the streams as well as the exit, and the process this shell launches can be
    // holding an inherited copy of them: it outlives the shell by design, so those pipes stay open
    // and `close` never arrives. The shell writes the id before it exits, so `exit` plus a moment
    // for the pipe to drain is what settles this, and `close` still settles it first when it comes.
    child.on("exit", () => { setTimeout(done, 250).unref(); });
    child.on("close", done);
  });
  const pid = Number(shell.out);
  if (Number.isSafeInteger(pid) && pid > 0) return { pid };
  // `Start-Process` writes its refusal to the error stream and prints no id. Carrying it out is what
  // separates a launch that was refused from one whose process died immediately after starting.
  return { detail: shell.err === "" ? "Start-Process reported no process id" : shell.err.replaceAll(/\s+/gu, " ") };
}

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
  endpoint: string,
  maxWaitMs: number,
  onProgress?: (event: ManagedProgramProgress) => void,
): Promise<ManagedProgramReport> {
  const base = { id: program.id, endpoint };
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
  const logPath = join(directory(root, program), "program.log");
  const installLogPath = join(directory(root, program), "install.log");
  if (program.installation !== undefined) {
    const installation = await program.installation.probe();
    if (installation.state !== "ready") {
      await mkdir(directory(root, program), { recursive: true });
      await rotateLog(installLogPath);
      onProgress?.({ id: program.id, phase: "installing", logPath: installLogPath });
      for (const command of program.installation.commands) {
        const result = await run(root, command, installLogPath);
        if (!result.ok) {
          return { ...base, action: "unchanged", state: initial, logPath: installLogPath, detail: `${command.command} failed: ${result.detail}` };
        }
      }
      const after = await program.installation.probe();
      if (after.state !== "ready") {
        return { ...base, action: "unchanged", state: initial, logPath: installLogPath, detail: `installation is ${after.state}: ${after.detail}` };
      }
      installed = true;
    }
  }
  if (program.start === undefined) {
    // Nothing to keep running: installation was the whole job.
    const state = await program.probe();
    if (state.state === "ready") onProgress?.({ id: program.id, phase: "ready" });
    return {
      ...base,
      action: state.state === "ready" && installed ? "installed" : "unchanged",
      state,
      ...(installed ? { logPath: installLogPath } : {}),
    };
  }

  onProgress?.({ id: program.id, phase: "starting", logPath });
  await mkdir(directory(root, program), { recursive: true });
  await rotateLog(logPath);
  const log = await open(logPath, "a");
  try {
    // Outliving this process is the point, and what grants it differs by platform.
    //
    // POSIX wants its own session, which `detached` gives.
    //
    // Windows ties a process's lifetime to the console it is attached to. A child spawned from here
    // inherits this one, so when the launching `node` exits its console is destroyed and every
    // process on it is sent CTRL_CLOSE_EVENT and terminated. `unref` does not change that — it
    // removes an event-loop reference and nothing else — so the service reported ready, answered one
    // health probe, and was gone by the next command, with no error anywhere to read.
    //
    // What it needs is a console of its own, hidden. `detached` on Windows means DETACHED_PROCESS,
    // which is no console at all, and then the first console grandchild — `uv` re-execing Python,
    // Python opening workers — allocates a fresh visible one. `Start-Process -WindowStyle Hidden`
    // creates a new console and hides it, which is the combination neither spawn option reaches.
    const started = process.platform === "win32"
      ? await startWithOwnConsole(program.start, root, logPath)
      : { pid: await startDetached(program.start, root, log.fd) };
    if (started.pid === undefined) {
      const refusal = "detail" in started && started.detail !== undefined ? `: ${started.detail}` : "";
      return {
        ...base,
        action: "unchanged",
        state: initial,
        detail: `${program.start.command} did not start${refusal}`,
        logPath,
      };
    }
    const child = { pid: started.pid };
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
    await log?.close();
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
  const reports = await Promise.all(independentPrograms(programs).map(async ({ instance, program }) =>
    await bringUp(dataRoot, program, instance, options.maxWaitMs ?? 300_000, options.onProgress)));
  return { dataRoot, programs: reports };
}

/** Stop programs whose machine-level process records say Hypit started them. */
export async function takeManagedProgramsDown(
  path: string,
  options: ManagedProgramOptions = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly ManagedProgramReport[] }> {
  const { dataRoot, programs } = await declaredManagedPrograms(path, options);
  const reports = await Promise.all(independentPrograms(programs).map(async ({ instance, program }): Promise<ManagedProgramReport> => {
    const base = { id: program.id, endpoint: instance };
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
  const reports = await Promise.all(independentPrograms(programs).map(async ({ instance, program }): Promise<ManagedProgramReport> => {
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
      endpoint: instance,
      state,
      ...(pid !== undefined && processAlive(pid) ? { pid } : {}),
      ...(hasLog ? { logPath } : {}),
    };
  }));
  return { dataRoot, programs: reports };
}
