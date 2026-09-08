import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import type { CaptureInput } from "./capture.js";
import type { HyperframesRenderProgress } from "./render.js";

const exec = promisify(execFile);
const cleanupMs = 5_000;

/** Chrome starts its own process group, so stopping only the Node child is insufficient. */
async function killRenderTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await exec("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: cleanupMs });
    return;
  }
  const { stdout } = await exec("ps", ["-A", "-o", "pid=,ppid="], { timeout: cleanupMs });
  const rows = stdout.trim().split("\n").map((line) => line.trim().split(/\s+/u).map(Number));
  const descendants = [pid];
  for (let i = 0; i < descendants.length; i++) {
    for (const [child, parent] of rows) if (parent === descendants[i] && child !== undefined) descendants.push(child);
  }
  for (const child of descendants.reverse()) {
    for (const target of [-child, child]) {
      try { process.kill(target, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    // Signal delivery is asynchronous. Wait for execution to stop while the
    // parent is still alive to reap its child; zombies no longer hold resources.
    const deadline = Date.now() + cleanupMs;
    while (true) {
      const state = await exec("ps", ["-p", String(child), "-o", "stat="], { timeout: cleanupMs })
        .then(({ stdout }) => stdout.trim(), (error) => {
          if (error.code === 1 && !error.stdout?.trim()) return "";
          throw error;
        });
      if (state === "" || state.startsWith("Z")) break;
      if (Date.now() >= deadline) throw new Error(`Render process ${child} did not stop after SIGKILL`);
      await delay(20);
    }
  }
}

/** One disposable execution, with no persisted state or resubmission behavior. */
export async function runCaptureProcess(
  input: CaptureInput,
  signal: AbortSignal,
  onProgress: (event: HyperframesRenderProgress) => void,
  entry = new URL("./capture-worker.ts", import.meta.url),
): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), fileURLToPath(entry)], {
      detached: process.platform !== "win32", windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let failure: Error | undefined;
    let completed = false;
    let outputBytes = 0;
    let stderr = "";
    let grace: ReturnType<typeof setTimeout> | undefined;
    let killing: Promise<void> | undefined;
    const kill = () => {
      if (grace !== undefined) clearTimeout(grace);
      killing ??= (child.pid === undefined ? Promise.resolve() : killRenderTree(child.pid)).catch((error) => {
        failure = new Error(`${failure?.message ?? "Render cleanup failed"}; ${String(error)}`);
        child.kill("SIGKILL");
      });
      return killing;
    };
    const stop = (error: Error) => {
      failure ??= error;
      if (child.connected) child.send({ type: "abort", error: failure.message }, () => {});
      grace ??= setTimeout(() => { void kill(); }, cleanupMs);
    };
    const abort = () => stop(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
    signal.addEventListener("abort", abort, { once: true });
    const log = (chunk: Buffer, error: boolean) => {
      outputBytes += chunk.byteLength;
      if (error) stderr = `${stderr}${chunk.toString()}`.slice(-32_000);
      if (outputBytes > input.config.maxProcessOutputBytes) stop(new Error("HyperFrames process output exceeded the configured limit"));
    };
    child.stdout?.on("data", (chunk: Buffer) => log(chunk, false));
    child.stderr?.on("data", (chunk: Buffer) => log(chunk, true));
    child.on("message", (value: { type: string; event?: HyperframesRenderProgress; error?: string }) => {
      if (value.type === "progress" && value.event !== undefined) {
        try { onProgress(value.event); } catch (error) { stop(error instanceof Error ? error : new Error(String(error))); }
      } else if (value.type === "stopping") {
        stop(new Error(value.error));
      } else if (value.type === "completed" || value.type === "failed") {
        completed = value.type === "completed";
        if (!completed) failure ??= new Error(value.error);
        // The worker has finished cleanup. Terminate any leftover descendants before releasing capacity.
        void kill();
      }
    });
    child.on("error", (error) => { failure ??= error; void kill(); });
    child.on("close", () => {
      if (grace !== undefined) clearTimeout(grace);
      signal.removeEventListener("abort", abort);
      void (killing ?? Promise.resolve()).then(() => {
        if (failure !== undefined) reject(failure);
        else if (!completed) reject(new Error(`HyperFrames process exited before completion: ${stderr}`));
        else resolve();
      });
    });
    child.send({ type: "start", input }, (error) => { if (error) { failure ??= error; void kill(); } });
    if (signal.aborted) abort();
  });
}
