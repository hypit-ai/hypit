import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

import { canonicalize } from "@svml/protocol";
import type { CanonicalValue } from "@svml/protocol";
import type { JsonInvoker } from "@svml/transport";

export type ProcessJsonInvokerOptions = {
  /** Must be absolute; shell lookup and shell interpolation are never used. */
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  /** The child receives exactly these variables. Parent environment inheritance is never implicit. */
  readonly environment?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

function append(
  chunks: Uint8Array[],
  chunk: Uint8Array,
  current: number,
  limit: number,
): number {
  const next = current + chunk.byteLength;
  if (next > limit) throw new Error(`child process output exceeded ${limit} bytes`);
  chunks.push(Uint8Array.from(chunk));
  return next;
}

function concatenate(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

/** One JSON document on stdin, one JSON document on stdout, no shell and no ambient environment. */
export class ProcessJsonInvoker implements JsonInvoker {
  readonly #options: Required<Pick<
    ProcessJsonInvokerOptions,
    "executable" | "timeoutMs" | "maxInputBytes" | "maxOutputBytes"
  >> & Omit<ProcessJsonInvokerOptions, "executable" | "timeoutMs" | "maxInputBytes" | "maxOutputBytes">;

  constructor(options: ProcessJsonInvokerOptions) {
    assert(isAbsolute(options.executable), "process executable must be an absolute path");
    assert(options.args?.every((arg) => typeof arg === "string") ?? true, "process args are invalid");
    assert(Object.entries(options.environment ?? {}).every(([key, value]) =>
      key.length > 0 && !key.includes("=") && typeof value === "string"),
      "process environment contains an invalid name");
    this.#options = {
      executable: options.executable,
      timeoutMs: positiveInteger(options.timeoutMs, "process timeoutMs"),
      maxInputBytes: positiveInteger(options.maxInputBytes ?? 16 * 1024 * 1024, "process maxInputBytes"),
      maxOutputBytes: positiveInteger(options.maxOutputBytes ?? 16 * 1024 * 1024, "process maxOutputBytes"),
      ...(options.args === undefined ? {} : { args: [...options.args] }),
      ...(options.cwd === undefined ? {} : { cwd: resolve(options.cwd) }),
      ...(options.environment === undefined ? {} : { environment: { ...options.environment } }),
    };
  }

  async invoke(
    request: CanonicalValue,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<CanonicalValue> {
    if (options.signal?.aborted === true) throw options.signal.reason ?? new Error("process invocation was aborted");
    const input = new TextEncoder().encode(JSON.stringify(canonicalize(request)));
    assert(input.byteLength <= this.#options.maxInputBytes,
      `process JSON input is ${input.byteLength} bytes, over limit ${this.#options.maxInputBytes}`);
    return await new Promise<CanonicalValue>((resolveResult, reject) => {
      const child = spawn(this.#options.executable, [...(this.#options.args ?? [])], {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...(this.#options.environment ?? {}) },
        ...(this.#options.cwd === undefined ? {} : { cwd: this.#options.cwd }),
      });
      const stdout: Uint8Array[] = [];
      const stderr: Uint8Array[] = [];
      let stdoutSize = 0;
      let stderrSize = 0;
      let failure: Error | undefined;
      let settled = false;
      const fail = (error: Error): void => {
        failure ??= error;
        child.kill("SIGKILL");
      };
      const abort = (): void => fail(
        options.signal?.reason instanceof Error
          ? options.signal.reason
          : new Error("process invocation was aborted"),
      );
      const timer = setTimeout(() => fail(new Error(
        `process invocation exceeded ${this.#options.timeoutMs}ms`,
      )), this.#options.timeoutMs);
      options.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => {
        try {
          stdoutSize = append(stdout, chunk, stdoutSize, this.#options.maxOutputBytes);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        try {
          stderrSize = append(stderr, chunk, stderrSize, this.#options.maxOutputBytes);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
      child.on("error", (error) => fail(error));
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        if (failure !== undefined) {
          reject(failure);
          return;
        }
        if (code !== 0) {
          // stderr is drained and bounded, but never copied into framework errors where secrets may persist.
          reject(new Error(`process exited with ${code ?? `signal ${signal ?? "unknown"}`}`));
          return;
        }
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(concatenate(stdout, stdoutSize));
          assert(text.length > 0, "process returned an empty JSON response");
          resolveResult(canonicalize(JSON.parse(text)));
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.on("error", (error) => fail(error));
      child.stdin.end(input);
    });
  }
}
