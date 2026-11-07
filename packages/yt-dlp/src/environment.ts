import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hypitHostStateRoot } from "@hypit/host-paths";

function pythonEnvironmentCommand(environment: string, name: string): string {
  return process.platform === "win32"
    ? resolve(environment, "Scripts", `${name}.exe`)
    : resolve(environment, "bin", name);
}

/** One selected, locked environment. Fetching media never invokes its installer. */
export function videoDownloadEnvironment() {
  const project = resolve(import.meta.dirname, "../runtime");
  const version = /"yt-dlp(?:\[[^\]]+\])?==([^"]+)"/u.exec(readFileSync(join(project, "pyproject.toml"), "utf8"))?.[1];
  if (version === undefined) throw new Error("yt-dlp runtime must declare its exact upstream version");
  const environment = join(hypitHostStateRoot(), "programs", "yt-dlp", version, ".venv");
  return { project, version, environment, executable: pythonEnvironmentCommand(environment, "yt-dlp") };
}

export function requireVideoDownload(): string {
  const selected = videoDownloadEnvironment();
  const result = spawnSync(selected.executable, ["--ignore-config", "--version"], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  // PyPI normalizes date-version leading zeroes; the executable retains them.
  const release = (value: string) => value.trim().split(".").map((part) => part.replace(/^0+(?=\d)/u, "")).join(".");
  if (result.status !== 0 || release(result.stdout ?? "") !== release(selected.version)) {
    throw new Error(`yt-dlp ${selected.version} is not ready at ${selected.executable}; run hypit download prepare. ${result.error?.message ?? result.stderr?.trim() ?? ""}`);
  }
  return selected.executable;
}

/** Explicit provisioning. uv owns dependency resolution and the environment. */
export function prepareVideoDownload(): string {
  const selected = videoDownloadEnvironment();
  const result = spawnSync("uv", ["sync", "--project", selected.project, "--frozen", "--no-dev"], {
    env: { ...process.env, UV_PROJECT_ENVIRONMENT: selected.environment },
    stdio: ["ignore", "inherit", "inherit"], windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error(`yt-dlp preparation failed: ${result.error?.message ?? `uv exited ${result.status}`}`);
  return requireVideoDownload();
}
