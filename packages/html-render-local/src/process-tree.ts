import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const cleanupMilliseconds = 5_000;

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ESRCH";
}

/** Terminate one disposable local worker and every process it started. */
export async function terminateLocalProcessTree(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Local process id is invalid.");
  if (process.platform === "win32") {
    try {
      await runFile("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        timeout: cleanupMilliseconds,
      });
    } catch (error) {
      try { process.kill(pid, 0); }
      catch (probeError) { if (missing(probeError)) return; }
      throw error;
    }
    return;
  }

  const descendants = [pid];
  for (let index = 0; index < descendants.length; index += 1) {
    const children = await runFile("pgrep", ["-P", String(descendants[index])], {
      timeout: cleanupMilliseconds,
    }).then(({ stdout }) => stdout.trim().split(/\s+/u).filter(Boolean).map(Number), (error) => {
      if ((error as { readonly code?: unknown }).code === 1) return [];
      throw error;
    });
    for (const child of children) if (!descendants.includes(child)) descendants.push(child);
  }

  for (const child of descendants.toReversed()) {
    for (const target of [-child, child]) {
      try { process.kill(target, "SIGKILL"); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ESRCH" && !(target < 0 && code === "EPERM")) throw error;
      }
    }
  }

  const deadline = Date.now() + cleanupMilliseconds;
  let remaining = descendants;
  while (remaining.length > 0) {
    remaining = remaining.filter((child) => {
      try { process.kill(child, 0); return true; }
      catch (error) { if (missing(error)) return false; throw error; }
    });
    if (remaining.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(`Local process ${remaining[0]} did not stop after SIGKILL.`);
    }
    await delay(20);
  }
}
