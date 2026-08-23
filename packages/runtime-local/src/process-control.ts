import { execFile } from "node:child_process";

export type ProcessStopResult = "sent" | "gone" | "denied";

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error ? String(error.code) : undefined;
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function signal(pid: number, force: boolean): ProcessStopResult {
  if (!processAlive(pid)) return "gone";
  const name = force ? "SIGKILL" : "SIGTERM";
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, name);
      return "sent";
    } catch (error) {
      if (errorCode(error) === "EPERM") return "denied";
      if (errorCode(error) !== "ESRCH") throw error;
    }
  }
  return "gone";
}

function taskkill(pid: number, force: boolean): Promise<ProcessStopResult> {
  if (!processAlive(pid)) return Promise.resolve("gone");
  return new Promise((resolve, reject) => {
    execFile("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], {
      shell: false,
      windowsHide: true,
      timeout: 15_000,
    }, (error) => {
      if (error === null) resolve("sent");
      else if (!processAlive(pid)) resolve("sent");
      else if (errorCode(error) === "EACCES" || errorCode(error) === "EPERM") resolve("denied");
      else reject(new Error(`taskkill could not stop process tree ${pid}: ${error.message}`));
    });
  });
}

/** Stop the OS-owned process tree rooted at a process Hypit started. */
export async function stopProcessTree(pid: number, force = false): Promise<ProcessStopResult> {
  return process.platform === "win32" ? await taskkill(pid, force) : signal(pid, force);
}
