import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { runtimeConfigObject, runtimeConfigString } from "@narratage/runtime-adapter";
import type { RuntimeAdapterFactoryContext, ManagedProgramCommand } from "@narratage/runtime-adapter";
import { resolveRuntimeExecutable } from "@narratage/runtime-adapter-node";

/**
 * Repository deployment bundled beside this Provider during development. A
 * published package must ship the same project as package data; it must never
 * silently fall back to an unrelated system Python.
 */
export const localOpenCvManagedProject = fileURLToPath(
  new URL("../../../services/image-opencv", import.meta.url),
);

export type LocalOpenCvDeployment = {
  readonly pythonExecutable: string;
  readonly prepare?: ManagedProgramCommand;
  readonly ownership: "managed" | "external";
};

function managedPython(project: string): string {
  return process.platform === "win32"
    ? join(project, ".venv", "Scripts", "python.exe")
    : join(project, ".venv", "bin", "python");
}

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
  return {
    pythonExecutable: managedPython(localOpenCvManagedProject),
    prepare: {
      command: "uv",
      args: ["sync", "--project", localOpenCvManagedProject, "--frozen"],
    },
    ownership: "managed",
  };
}
