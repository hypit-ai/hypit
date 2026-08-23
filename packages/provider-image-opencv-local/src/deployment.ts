import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { runtimeConfigObject, runtimeConfigString } from "@hypit/runtime-kit";
import type { RuntimeAdapterFactoryContext, ManagedProgramCommand } from "@hypit/runtime-kit";
import {
  pythonEnvironmentExecutable,
  resolveRuntimeExecutable,
} from "@hypit/runtime-host-node";

/**
 * The locked Python project is its own package asset. Repository workspaces and
 * installed npm distributions therefore resolve the same immutable input.
 */
const require = createRequire(import.meta.url);
export const localOpenCvManagedProject = join(
  require.resolve("@hypit/image-opencv-runtime/pyproject.toml"),
  "..",
);

export type LocalOpenCvDeployment = {
  readonly pythonExecutable: string;
  readonly stateRoot?: string;
  readonly installCommands?: readonly ManagedProgramCommand[];
  readonly ownership: "managed" | "external";
};

/**
 * One resolution function is shared by Endpoint construction, doctor and the
 * service lifecycle. An explicit executable is operator-owned and receives no
 * unrelated workspace preparation. With no override the bundled frozen uv
 * project is the complete managed deployment.
 */
export function resolveLocalOpenCvDeployment(
  context: RuntimeAdapterFactoryContext,
): LocalOpenCvDeployment {
  const config = runtimeConfigObject(context.config, "local OpenCV image");
  const configured = runtimeConfigString(config.pythonExecutable, "OpenCV pythonExecutable");
  if (configured !== undefined) {
    return {
      pythonExecutable: resolveRuntimeExecutable(context.dataRoot, configured),
      ownership: "external",
    };
  }
  if (!existsSync(localOpenCvManagedProject)) {
    throw new Error(
      "local OpenCV has no bundled managed runtime; configure pythonExecutable explicitly",
    );
  }
  const stateRoot = join(context.hostStateRoot, "programs", "image-opencv");
  const environment = join(stateRoot, ".venv");
  return {
    pythonExecutable: pythonEnvironmentExecutable(environment),
    stateRoot,
    installCommands: [{
      command: "uv",
      args: ["sync", "--project", localOpenCvManagedProject, "--frozen"],
      env: { UV_PROJECT_ENVIRONMENT: environment },
    }],
    ownership: "managed",
  };
}
