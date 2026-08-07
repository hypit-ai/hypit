import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";

import type { RuntimeDoctorDiagnostic } from "@svml/runtime-adapter";

function pathLike(value: string): boolean {
  return isAbsolute(value) || value.includes("/") || value.includes("\\");
}

/** Bare command names remain PATH-resolved; configured relative paths are rooted at the Runtime Profile root. */
export function resolveRuntimeExecutable(root: string, value: string): string {
  return pathLike(value) && !isAbsolute(value) ? resolve(root, value) : value;
}

async function executableExists(value: string): Promise<boolean> {
  if (pathLike(value)) {
    try {
      await access(value, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    try {
      await access(resolve(directory, value), constants.X_OK);
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}

export async function diagnoseRuntimeExecutable(options: {
  readonly root: string;
  readonly configured: string | undefined;
  readonly fallback: string;
  readonly subject: string;
}): Promise<readonly RuntimeDoctorDiagnostic[]> {
  const value = resolveRuntimeExecutable(options.root, options.configured ?? options.fallback);
  return await executableExists(value) ? [] : [{
    severity: "error",
    code: "RUNTIME_EXECUTABLE_MISSING",
    message: `${options.subject} executable ${value} is unavailable`,
    subject: value,
  }];
}

export function diagnoseRuntimeEnvironmentCredential(
  variable: string,
  subject: string,
): readonly RuntimeDoctorDiagnostic[] {
  return process.env[variable]?.trim()
    ? []
    : [{
      severity: "error",
      code: "RUNTIME_CREDENTIAL_MISSING",
      message: `${subject} requires environment variable ${variable}`,
      subject: variable,
    }];
}
