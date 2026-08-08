import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runtimeConfigObject, runtimeConfigString } from "@narratage/runtime-adapter";
import type { RuntimeAdapterFactoryContext, RuntimeExternalService, RuntimeServiceState } from "@narratage/runtime-adapter";
import { resolveRuntimeExecutable } from "@narratage/runtime-adapter-node";

const WORKSPACE_PROJECT = fileURLToPath(new URL("../../../services/image-opencv", import.meta.url));

/**
 * Absolute, because a Runtime root is wherever the operator keeps their Profile
 * and not where the pinned uv project lives. An installation without that
 * project has nothing to prepare and says so through the probe instead.
 */
function workspacePrepare() {
  if (!existsSync(WORKSPACE_PROJECT)) return undefined;
  return { command: "uv", args: ["sync", "--project", WORKSPACE_PROJECT, "--frozen"] };
}

/** Kept equal to `services/image-opencv/pyproject.toml` by a test in this package. */
const REQUIRED_MAJOR = { cv2: 4, numpy: 2 } as const;

const PROBE_PROGRAM =
  "import cv2, numpy, json; print(json.dumps({'cv2': cv2.__version__, 'numpy': numpy.__version__}))";

function run(executable: string, args: readonly string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(executable, [...args], { timeout: 15_000, shell: false }, (error, stdout, stderr) => {
      resolve(error === null
        ? { ok: true, output: stdout.trim() }
        : { ok: false, output: (stderr.trim() || error.message).split("\n").at(-1) ?? "" });
    });
  });
}

/**
 * OpenCV runs as one bounded process per Need, so there is nothing to keep warm
 * and this service declares no `start`. What it does declare is the
 * interpreter's identity: a Python without `cv2`, or with a `cv2` from before
 * the APIs this Provider calls, fails in the middle of a Build with a
 * subprocess error. Probing says so at `doctor` time instead.
 */
export function localOpenCvService(context: RuntimeAdapterFactoryContext): RuntimeExternalService {
  const config = runtimeConfigObject(context.config, "local OpenCV image");
  const configured = runtimeConfigString(config.pythonExecutable, "OpenCV pythonExecutable");
  const python = configured === undefined ? "python3" : resolveRuntimeExecutable(context.root, configured);
  const prepare = workspacePrepare();
  return {
    id: "image-opencv",
    ...(prepare === undefined ? {} : { prepare }),
    async probe(): Promise<RuntimeServiceState> {
      const result = await run(python, ["-c", PROBE_PROGRAM]);
      if (!result.ok) return { state: "down", detail: `${python} cannot import cv2 and numpy: ${result.output}` };
      let found: Record<string, string>;
      try {
        found = JSON.parse(result.output) as Record<string, string>;
      } catch {
        return { state: "down", detail: `${python} answered something other than a version report` };
      }
      const differs = Object.entries(REQUIRED_MAJOR)
        .filter(([name, major]) => Number.parseInt(found[name] ?? "", 10) !== major)
        .map(([name, major]) => `${name} is ${found[name] ?? "absent"}, expected ${major}.x`);
      return differs.length === 0
        ? { state: "ready" }
        : { state: "mismatch", detail: `${python} carries ${differs.join("; ")}` };
    },
  };
}
