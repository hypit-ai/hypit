import { spawn } from "node:child_process";

/** Run one external program to completion and return its stdout; stderr becomes the error text. */
export function runProcess(executable: string, args: readonly string[], timeoutMs = 300_000): Promise<Buffer> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
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
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { err = `${err}${chunk.toString("utf8")}`.slice(-100_000); });
    child.on("error", (error) => finish(new Error(`${executable} could not start: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`${executable} exited with ${code}: ${err.trim()}`));
    });
  });
}
