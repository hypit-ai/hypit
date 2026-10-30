import { writeSync } from "node:fs";
import { killRenderDescendantsSync } from "./process-tree.js";

/**
 * Install worker-owned emergency cleanup. Importing this module has no process effect;
 * a renderer worker must opt in after it owns the process and before it launches children.
 */
export function installCaptureExitCleanup(): () => void {
  const cleanup = () => {
    try { killRenderDescendantsSync(process.pid); }
    catch (error) {
      writeSync(2, `Render exit cleanup could not be confirmed: ${String(error)}\n`);
    }
  };
  // `taskkill /T` includes the Windows owner process itself. During an uncaught
  // failure the exit hook can therefore stop Node before its usual diagnostic is
  // flushed. Preserve that diagnostic synchronously before cleanup begins.
  const reportUncaught = (error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    writeSync(2, `${message}\n`);
  };
  const terminate = () => process.exit(143);
  const interrupt = () => process.exit(130);
  process.once("exit", cleanup);
  process.once("SIGTERM", terminate);
  process.once("SIGINT", interrupt);
  if (process.platform === "win32") process.on("uncaughtExceptionMonitor", reportUncaught);
  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    process.off("exit", cleanup);
    process.off("SIGTERM", terminate);
    process.off("SIGINT", interrupt);
    if (process.platform === "win32") process.off("uncaughtExceptionMonitor", reportUncaught);
  };
}
