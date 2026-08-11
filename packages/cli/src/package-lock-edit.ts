import { open, readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { resolve } from "node:path";

function isAlreadyExists(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error
    && (error as { readonly code?: unknown }).code === "EEXIST";
}

/**
 * Serialize local package-lock writers with the same deliberately simple protocol Git uses for
 * its index: one sibling sentinel, no daemon and no hidden stale-lock recovery.
 */
export async function withPackageLockEdit<T>(
  packageLock: string,
  action: () => Promise<T>,
): Promise<T> {
  const target = resolve(packageLock);
  const sentinel = `${target}.editing`;
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(sentinel, "wx", 0o600);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const owner = await readFile(sentinel, "utf8").catch(() => "unknown owner");
    throw new Error(
      `package lock ${target} is already being edited (${owner.trim().slice(0, 300)}); `
      + `if that process no longer exists, remove ${sentinel}`,
    );
  }
  try {
    await handle.writeFile(`${JSON.stringify({
      format: "narratage.package-lock-edit@1",
      pid: process.pid,
      host: hostname(),
      startedAt: new Date().toISOString(),
      target,
    })}\n`, "utf8");
    await handle.sync();
    return await action();
  } finally {
    await handle.close().catch(() => undefined);
    await rm(sentinel, { force: true }).catch(() => undefined);
  }
}
