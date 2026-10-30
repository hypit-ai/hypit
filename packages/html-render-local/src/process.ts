import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";

type ProcessResult = {
  readonly stdout: Uint8Array;
  readonly stderr: string;
};

type ProcessArguments = {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
};

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

/** Resolve the selected media command once, without adding another fallback search policy. */
export async function mediaExecutablePath(value: string): Promise<string> {
  const pathLike = isAbsolute(value) || value.includes("/") || value.includes("\\");
  const bases = pathLike ? [resolve(value)]
    : (process.env.PATH ?? "").split(delimiter).filter(Boolean).map(directory => resolve(directory, value));
  const extensions = process.platform === "win32" && !/\.[^\\/]+$/u.test(value) ? [".exe", ".com", ""] : [""];
  for (const base of bases) for (const extension of extensions) {
    const candidate = `${base}${extension}`;
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
  throw new Error(`HTML renderer media executable ${value} is unavailable; correct the Provider's ffmpegPath or ffprobePath.`);
}

export function processEnvironment(platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  // POSIX temp is TMPDIR; Windows is TEMP/TMP. Browser and media subprocesses
  // inherit only the environment needed for deterministic local execution.
  const names = platform === "win32"
    ? ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "ComSpec", "TEMP", "TMP", "USERPROFILE", "LANG", "LC_ALL"] as const
    : ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"] as const;
  return Object.fromEntries(names.flatMap((name) => process.env[name] === undefined
    ? []
    : [[name, process.env[name]]])) as NodeJS.ProcessEnv;
}

export async function runProcess(args: ProcessArguments): Promise<ProcessResult> {
  args.signal?.throwIfAborted();
  return await startProcess(args, false).completed;
}

/** Start one process whose stdin is written incrementally by a single caller. */
export function openProcessInput(args: ProcessArguments): {
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly close: () => Promise<ProcessResult>;
  readonly completed: Promise<ProcessResult>;
} {
  args.signal?.throwIfAborted();
  const process = startProcess(args, true);
  const input = process.input!;
  let ended = false;
  let closing: Promise<ProcessResult> | undefined;
  return {
    completed: process.completed,
    write: async (bytes) => {
      assert(!ended, `${args.executable} input is already closed`);
      args.signal?.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        input.write(bytes, (error) => error === null || error === undefined ? resolve() : reject(error));
      });
      args.signal?.throwIfAborted();
    },
    close: () => {
      closing ??= (() => {
        ended = true;
        input.end();
        return process.completed;
      })();
      return closing;
    },
  };
}

function startProcess(args: ProcessArguments, pipeInput: boolean): {
  readonly input: import("node:stream").Writable | undefined;
  readonly completed: Promise<ProcessResult>;
} {
  let input: import("node:stream").Writable | undefined;
  const completed = new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(args.executable, [...args.argv], {
      shell: false,
      windowsHide: true,
      stdio: [pipeInput ? "pipe" : "ignore", "pipe", "pipe"],
      env: processEnvironment(),
    });
    input = child.stdin ?? undefined;
    const stdout: Buffer[] = [];
    let outputBytes = 0;
    let stderr = "";
    let settled = false;
    let failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      child.kill("SIGKILL");
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      args.signal?.removeEventListener("abort", abort);
      if (error === undefined) resolve({ stdout: Buffer.concat(stdout), stderr });
      else reject(error);
    };
    const abort = () => stop(args.signal?.reason ?? new Error("Process aborted"));
    args.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      stop(new Error(`${args.executable} timed out`));
    }, args.timeoutMs);
    child.stdout!.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > args.maxOutputBytes) {
        stop(new Error(`${args.executable} output exceeded the configured limit`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      stderr = `${stderr}${chunk.toString()}`.slice(-32_000);
      if (outputBytes > args.maxOutputBytes) {
        stop(new Error(`${args.executable} output exceeded the configured limit`));
      }
    });
    child.on("error", (error) => finish(error));
    // Writes receive their own EPIPE error. Keep the process result focused on
    // its exit code and stderr, which carry the useful encoder failure.
    child.stdin?.on("error", () => {});
    if (args.signal?.aborted) abort();
    child.on("close", (code) => {
      if (failure !== undefined) finish(failure);
      else if (code === 0) finish();
      else finish(new Error(`${args.executable} exited ${String(code)}: ${stderr}`));
    });
  });
  assert(!pipeInput || input !== undefined, `${args.executable} input pipe is unavailable`);
  return { input, completed };
}
