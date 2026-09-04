import { spawn } from "node:child_process";
import { once } from "node:events";

type ProcessInput = Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>;

function run(
  executable: string,
  args: readonly string[],
  input: ProcessInput | undefined,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, [...args], { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolveRun(Buffer.concat(out));
      else reject(error);
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(new Error(`${executable} timed out after ${timeoutMs} ms`)); }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => { err = `${err}${chunk.toString("utf8")}`.slice(-100_000); });
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

/** Run one external program to completion and return its stdout; stderr becomes the error text. */
export function runProcess(executable: string, args: readonly string[], timeoutMs = 300_000): Promise<Buffer> {
  return run(executable, args, undefined, timeoutMs);
}

/** The same process boundary when a deterministic byte stream is one of the program's inputs. */
export function runProcessWithInput(
  executable: string,
  args: readonly string[],
  input: ProcessInput,
  timeoutMs = 300_000,
): Promise<Buffer> {
  return run(executable, args, input, timeoutMs);
}
