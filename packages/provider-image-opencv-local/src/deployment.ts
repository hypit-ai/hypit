import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ManagedProgramCommand } from "@hypit/execution-environment-local/extension";
import {
  pythonEnvironmentExecutable,
  resolveEnvironmentExecutable,
} from "@hypit/execution-environment-local/node";

/** The locked Python project is immutable material owned and shipped by this Provider. */
export const localOpenCvManagedProject = fileURLToPath(new URL("../runtime", import.meta.url));

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
  input: {
    readonly hostStateRoot: string;
    readonly dataRoot: string;
    readonly instance: string;
    readonly pythonExecutable?: string;
  },
): LocalOpenCvDeployment {
  if (input.pythonExecutable !== undefined) {
    return {
      pythonExecutable: resolveEnvironmentExecutable(input.dataRoot, input.pythonExecutable),
      ownership: "external",
    };
  }
  if (!existsSync(localOpenCvManagedProject)) {
    throw new Error(
      "local OpenCV has no bundled managed runtime; configure pythonExecutable explicitly",
    );
  }
  const stateRoot = join(
    input.hostStateRoot,
    "programs",
    `image-opencv-${encodeURIComponent(input.instance)}`,
  );
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
