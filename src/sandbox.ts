import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "./diagnostics.js";
import type { KernelManifest } from "./kernel.js";
import type { KernelProjection } from "./runtime-contract.js";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export async function projectKernelIsolated(
  manifest: KernelManifest,
  input: unknown,
): Promise<KernelProjection> {
  const implementationPath = manifest.implementationPath;
  if (!implementationPath || manifest.profile !== "isolated-projector-v1") {
    fail(
      "kernel_projector_profile",
      `Kernel "${manifest.name}" is not an isolated projector.`,
    );
  }
  if (manifest.permissions.length) {
    fail(
      "kernel_permission_unsupported",
      `Kernel "${manifest.name}" requests unsupported projector permissions: ${manifest.permissions.join(", ")}.`,
    );
  }
  const worker = fileURLToPath(new URL("./sandbox-worker.mjs", import.meta.url));
  const packageRoot = dirname(manifest.sourcePath);
  const child = spawn(process.execPath, [
    "--experimental-vm-modules",
    "--permission",
    `--allow-fs-read=${packageRoot}`,
    "--max-old-space-size=128",
    worker,
    implementationPath,
    packageRoot,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let outputBytes = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
    else stdout.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  child.stdin.end(JSON.stringify(input));
  const code = await new Promise<number | null>((accept, reject) => {
    child.once("error", reject);
    child.once("exit", accept);
  });
  clearTimeout(timeout);
  if (code !== 0) {
    fail(
      "kernel_projector_isolation",
      `Kernel "${manifest.name}" failed in isolated projector: ${Buffer.concat(stderr).toString("utf8").trim() || `exit ${String(code)}`}.`,
    );
  }
  try {
    return JSON.parse(Buffer.concat(stdout).toString("utf8")) as KernelProjection;
  } catch {
    fail(
      "kernel_projector_output",
      `Kernel "${manifest.name}" did not return valid JSON from its isolated projector.`,
    );
  }
}
