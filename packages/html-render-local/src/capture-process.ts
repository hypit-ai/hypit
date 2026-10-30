import type { ExecutionDiagnostic } from "@hypit/endpoint";
import { spawn } from "node:child_process";
import { killRenderTree } from "./process-tree.js";
import type { HtmlRasterProgress } from "./render.js";

const cleanupMs = 5_000;

/** The process supervisor only owns output bounding; the child owns the capture payload. */
export type CaptureProcessInput = {
  readonly config: {
    readonly maxProcessOutputBytes: number;
  };
  readonly frames?: readonly number[];
};

export type CaptureWorkerLaunch = {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly detached?: boolean;
};

/** One disposable execution, with no persisted state or resubmission behavior. */
export async function runCaptureProcess<T extends CaptureProcessInput>(
  input: T,
  signal: AbortSignal,
  onProgress: (event: HtmlRasterProgress) => void,
  launch: CaptureWorkerLaunch,
  onDiagnostic?: (diagnostic: ExecutionDiagnostic) => Promise<void>,
): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.executable, [...launch.args], {
      ...(launch.env === undefined ? {} : { env: launch.env }),
      detached: launch.detached ?? false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let failure: Error | undefined;
    let completed = false;
    let closed = false;
    let exited = false;
    let outputBytes = 0;
    let stderr = "";
    let diagnostics = Promise.resolve();
    let grace: ReturnType<typeof setTimeout> | undefined;
    let killing: Promise<void> | undefined;
    const kill = () => {
      if (grace !== undefined) clearTimeout(grace);
      grace = undefined;
      // A PID is no longer ours after exit. Inherited pipes can outlive it, but
      // looking up that old PID cannot recover the former process tree safely.
      if (exited) {
        child.stdout?.destroy();
        child.stderr?.destroy();
        return Promise.resolve();
      }
      killing ??= (child.pid === undefined ? Promise.resolve() : killRenderTree(child.pid)).catch((error) => {
        if (!completed) failure = new Error(`${failure?.message ?? "Render cleanup failed"}; ${String(error)}`);
        diagnostic({ level: "warning", message: `Rasterizer process-tree cleanup could not be confirmed: ${String(error)}` });
        child.kill("SIGKILL");
      });
      return killing;
    };
    const stop = (error: Error) => {
      failure ??= error;
      if (closed) return;
      if (child.connected) child.send({ type: "abort", error: failure.message }, () => {});
      awaitExit();
    };
    const diagnostic = (value: ExecutionDiagnostic) => {
      if (onDiagnostic === undefined) return;
      diagnostics = diagnostics.then(() => onDiagnostic(value))
        .catch((error) => stop(error instanceof Error ? error : new Error(String(error))));
    };
    const awaitExit = () => {
      grace ??= setTimeout(() => {
        diagnostic({ level: "warning", message: exited
          ? `Rasterizer process exited but its output pipes did not close within ${cleanupMs} ms; closing this execution's pipes`
          : `Rasterizer process did not exit within ${cleanupMs} ms; terminating its remaining process tree` });
        void kill();
      }, cleanupMs);
    };
    const abort = () => stop(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
    signal.addEventListener("abort", abort, { once: true });
    const log = (chunk: Buffer, error: boolean) => {
      outputBytes += chunk.byteLength;
      if (error) stderr = `${stderr}${chunk.toString()}`.slice(-32_000);
      if (outputBytes > input.config.maxProcessOutputBytes) stop(new Error("HTML renderer process output exceeded the configured limit"));
    };
    for (const [stream, pipe] of [["stdout", child.stdout], ["stderr", child.stderr]] as const) {
      pipe?.setEncoding("utf8");
      pipe?.on("data", (text: string) => {
        log(Buffer.from(text), stream === "stderr");
        if (text.trim()) diagnostic({ stream, level: "info", message: text.trimEnd() });
      });
    }
    child.on("message", (value: { type: string; event?: HtmlRasterProgress; error?: string }) => {
      if (value.type === "progress" && value.event !== undefined) {
        try { onProgress(value.event); } catch (error) { stop(error instanceof Error ? error : new Error(String(error))); }
      } else if (value.type === "stopping") {
        stop(new Error(value.error));
      } else if (value.type === "completed" || value.type === "failed") {
        completed = value.type === "completed";
        if (completed) {
          // Successful capture has closed its resources and will disconnect after this message.
          awaitExit();
        } else {
          failure ??= new Error(value.error);
          // Resource cleanup may itself have failed. Keep the worker alive until
          // its remaining descendants have been discovered and terminated.
          void kill();
        }
      }
    });
    child.on("error", (error) => { failure ??= error; void kill(); });
    child.once("exit", (code, exitSignal) => {
      exited = true;
      if (!completed && failure === undefined) {
        failure = new Error(`HTML renderer process exited before completion (${exitSignal ?? `code ${String(code)}`})`);
      }
      if (exitSignal !== null && killing === undefined) {
        diagnostic({ level: "warning", message: `Rasterizer process was terminated by ${exitSignal}; descendant cleanup could not be confirmed` });
      }
      // An abruptly orphaned descendant may still hold stdout/stderr open.
      awaitExit();
    });
    child.on("close", (code, exitSignal) => {
      closed = true;
      if (grace !== undefined) clearTimeout(grace);
      signal.removeEventListener("abort", abort);
      void (killing ?? Promise.resolve()).then(async () => {
        await diagnostics;
        if (failure !== undefined) reject(new Error(`${failure.message}${stderr ? `\n${stderr}` : ""}`, { cause: failure }));
        else if (!completed) reject(new Error(`HTML renderer process exited before completion (${exitSignal ?? `code ${String(code)}`}): ${stderr}`));
        else resolve();
      });
    });
    child.send({ type: "start", input }, (error) => { if (error) { failure ??= error; void kill(); } });
    if (signal.aborted) abort();
  });
}
