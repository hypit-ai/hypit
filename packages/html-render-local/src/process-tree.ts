import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const cleanupMs = 5_000;

/** Chrome starts its own process group, so stopping only the Node child is insufficient. */
export async function killRenderTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    try {
      await exec("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: cleanupMs });
    } catch (error) {
      // The worker may exit after reporting completion, before taskkill opens it.
      // Ask the OS whether it is gone; localized taskkill output is not an API.
      try { process.kill(pid, 0); }
      catch (probeError) {
        if ((probeError as NodeJS.ErrnoException).code === "ESRCH") return;
      }
      throw error;
    }
    return;
  }
  const descendants = [pid];
  for (let i = 0; i < descendants.length; i++) {
    const children = await exec("pgrep", ["-P", String(descendants[i])], { timeout: cleanupMs })
      .then(({ stdout }) => stdout.trim().split(/\s+/u).filter(Boolean).map(Number),
        (error) => { if ((error as { code?: unknown }).code === 1) return []; throw error; });
    for (const child of children) if (!descendants.includes(child)) descendants.push(child);
  }
  // Kill the whole tree before waiting: only after every ancestor is dead are
  // orphaned descendants reparented and reaped, making kill(pid, 0) read ESRCH.
  for (const child of descendants.reverse()) {
    for (const target of [-child, child]) {
      try { process.kill(target, "SIGKILL"); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ESRCH" && !(target < 0 && code === "EPERM")) throw error;
      }
    }
  }
  const deadline = Date.now() + cleanupMs;
  let remaining = descendants;
  while (remaining.length > 0) {
    remaining = remaining.filter((child) => {
      try { process.kill(child, 0); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
    });
    if (remaining.length === 0) break;
    if (Date.now() >= deadline) throw new Error(`Rasterizer process ${remaining[0]} did not stop after SIGKILL`);
    await delay(20);
  }
}

/** Exit callbacks cannot await: stop live descendants before the owner is reparented. */
export function killRenderDescendantsSync(pid: number): void {
  if (process.platform === "win32") {
    // taskkill owns the traversal, including this exiting process, on Windows.
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true, timeout: cleanupMs, stdio: "pipe",
    });
    return;
  }
  const descendants = [pid];
  for (let i = 0; i < descendants.length; i++) {
    let output: string;
    try {
      output = execFileSync("pgrep", ["-P", String(descendants[i])], {
        encoding: "utf8", timeout: cleanupMs, stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if ((error as { status?: unknown }).status === 1) continue;
      throw error;
    }
    for (const child of output.trim().split(/\s+/u).filter(Boolean).map(Number)) {
      if (!descendants.includes(child)) descendants.push(child);
    }
  }
  for (const child of descendants.slice(1).reverse()) {
    for (const target of [-child, child]) {
      try { process.kill(target, "SIGKILL"); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ESRCH" && !(target < 0 && code === "EPERM")) throw error;
      }
    }
  }
}
