import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { hypitHostStateRoot } from "@hypit/host-paths";

function environmentCommand(environment: string, name: string): string {
  return process.platform === "win32"
    ? resolve(environment, "Scripts", `${name}.exe`)
    : resolve(environment, "bin", name);
}

export function manimRuntime() {
  const project = resolve(import.meta.dirname, "../runtime");
  const declaration = readFileSync(join(project, "pyproject.toml"), "utf8");
  const version = /"manim==([^"]+)"/u.exec(declaration)?.[1];
  if (version === undefined) throw new Error("Manim runtime must declare its exact upstream version.");
  const environment = join(hypitHostStateRoot(), "programs", "manim", version, ".venv");
  return {
    project,
    version,
    environment,
    python: environmentCommand(environment, "python"),
    manim: environmentCommand(environment, "manim"),
  };
}

export function requireManimRuntime() {
  const selected = manimRuntime();
  const result = spawnSync(selected.manim, ["--version"], {
    // The first Manim invocation may build the host font cache before printing its version.
    encoding: "utf8", windowsHide: true, timeout: 60_000,
  });
  const observed = /Manim Community v([^\s]+)/u.exec(result.stdout ?? "")?.[1];
  if (result.status !== 0 || observed !== selected.version) {
    throw new Error(`Manim ${selected.version} is not ready at ${selected.manim}. `
      + `${result.error?.message ?? result.stderr?.trim() ?? "Prepare the selected runtime first."}`);
  }
  return selected;
}

/** Explicit provisioning; ordinary execution never invokes uv. */
export function prepareManimRuntime() {
  const selected = manimRuntime();
  const result = spawnSync("uv", ["sync", "--project", selected.project, "--frozen", "--no-dev"], {
    env: { ...process.env, UV_PROJECT_ENVIRONMENT: selected.environment },
    stdio: ["ignore", "inherit", "inherit"], windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Manim preparation failed: ${result.error?.message ?? `uv exited ${result.status}`}`);
  }
  return requireManimRuntime();
}
