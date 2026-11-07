import { spawn } from "node:child_process";
import { once } from "node:events";
import { mediaProcessEnv } from "./process-env.js";

type ProcessInput = Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>;
type ProcessOutput = { readonly stdout: Buffer; readonly stderr: string };

function run(
  executable: string,
  args: readonly string[],
  input: ProcessInput | undefined,
  timeoutMs: number,
  onStderrLine?: (line: string) => void,
  maxStdoutBytes = Number.POSITIVE_INFINITY,
  environment?: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<ProcessOutput> {
  signal?.throwIfAborted();
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, [...args], {
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
      ...(environment === undefined ? {} : { env: environment }),
    });
    const out: Buffer[] = [];
    let stdoutBytes = 0;
    let err = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error === undefined) resolveRun({ stdout: Buffer.concat(out), stderr: err });
      else reject(error);
    };
    const abort = (): void => {
      child.kill("SIGKILL");
      finish(signal?.reason instanceof Error ? signal.reason : new Error("Media process was aborted."));
    };
    timer = setTimeout(() => { child.kill("SIGKILL"); finish(new Error(`${executable} timed out after ${timeoutMs} ms`)); }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxStdoutBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${executable} output exceeded the configured limit`));
        return;
      }
      out.push(chunk);
    });
    let pendingLine = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      err = `${err}${text}`.slice(-100_000);
      if (onStderrLine !== undefined) {
        const lines = `${pendingLine}${text}`.split(/\r?\n/u);
        pendingLine = lines.pop()!;
        for (const line of lines) onStderrLine(line);
      }
    });
    child.on("error", (error) => finish(new Error(`${executable} could not start: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`${executable} exited with ${code}: ${err.trim()}`));
    });
    if (input !== undefined && child.stdin !== null) {
      child.stdin.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EPIPE") finish(new Error(`${executable} input failed: ${error.message}`));
      });
      void (async () => {
        const chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array> = input instanceof Uint8Array ? [input] : input;
        for await (const chunk of chunks) {
          if (!child.stdin!.write(chunk)) await once(child.stdin!, "drain");
        }
        child.stdin!.end();
      })().catch((error: unknown) => {
        if (!(error instanceof Error && "code" in error && error.code === "EPIPE")) {
          child.kill("SIGKILL");
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }
  });
}

/** Shared bounded process boundary for the Provider and direct-file ports of local media. */
export async function runBoundedMediaProcess(options: {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly sharedLibraryPath?: string;
  readonly signal?: AbortSignal;
}): Promise<Uint8Array> {
  return (await run(options.executable, options.argv, undefined, options.timeoutMs, undefined,
    options.maxStdoutBytes,
    mediaProcessEnv(options.sharedLibraryPath === undefined ? undefined : {
      LD_LIBRARY_PATH: options.sharedLibraryPath,
    }), options.signal)).stdout;
}

/**
 * Stream a line-oriented tool response through a bounded parser. Total output may scale with media
 * duration, while retained memory is limited to one line and the caller's aggregate state.
 */
export function runMediaProcessLines(options: {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxLineBytes: number;
  readonly onLine: (line: string) => void;
  readonly sharedLibraryPath?: string;
  readonly signal?: AbortSignal;
}): Promise<void> {
  options.signal?.throwIfAborted();
  return new Promise((resolveRun, reject) => {
    const child = spawn(options.executable, [...options.argv], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: mediaProcessEnv(options.sharedLibraryPath === undefined ? undefined : {
        LD_LIBRARY_PATH: options.sharedLibraryPath,
      }),
    });
    let pending = Buffer.alloc(0);
    let err = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error === undefined) resolveRun();
      else reject(error);
    };
    const abort = (): void => {
      child.kill("SIGKILL");
      finish(options.signal?.reason instanceof Error
        ? options.signal.reason : new Error("Media process was aborted."));
    };
    const emit = (line: Buffer): boolean => {
      if (line.byteLength > options.maxLineBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${options.executable} output line exceeded the configured limit`));
        return false;
      }
      try {
        options.onLine(line.toString("utf8").replace(/\r$/u, ""));
        return true;
      } catch (error) {
        child.kill("SIGKILL");
        finish(error instanceof Error ? error : new Error(String(error)));
        return false;
      }
    };
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${options.executable} timed out after ${options.timeoutMs} ms`));
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout?.on("data", (chunk: Buffer) => {
      let bytes = pending.byteLength === 0 ? chunk : Buffer.concat([pending, chunk]);
      let newline = bytes.indexOf(0x0a);
      while (newline >= 0) {
        if (!emit(bytes.subarray(0, newline))) return;
        bytes = bytes.subarray(newline + 1);
        newline = bytes.indexOf(0x0a);
      }
      pending = Buffer.from(bytes);
      if (pending.byteLength > options.maxLineBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${options.executable} output line exceeded the configured limit`));
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err = `${err}${chunk.toString("utf8")}`.slice(-100_000);
    });
    child.on("error", (error) => finish(new Error(`${options.executable} could not start: ${error.message}`)));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(`${options.executable} exited with ${code}: ${err.trim()}`));
        return;
      }
      if (pending.byteLength > 0 && !emit(pending)) return;
      finish();
    });
  });
}

/** Run one external program to completion and return its stdout; stderr becomes the error text. */
export async function runProcess(executable: string, args: readonly string[], timeoutMs = 300_000): Promise<Buffer> {
  return (await run(executable, args, undefined, timeoutMs)).stdout;
}

/** Successful stderr can carry tool metadata, such as the timestamp of an extracted frame. */
export function runProcessOutput(executable: string, args: readonly string[], timeoutMs = 300_000, onStderrLine?: (line: string) => void): Promise<ProcessOutput> {
  return run(executable, args, undefined, timeoutMs, onStderrLine);
}

/** The same process boundary when a deterministic byte stream is one of the program's inputs. */
export async function runProcessWithInput(
  executable: string,
  args: readonly string[],
  input: ProcessInput,
  timeoutMs = 300_000,
): Promise<Buffer> {
  return (await run(executable, args, input, timeoutMs)).stdout;
}
