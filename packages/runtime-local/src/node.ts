import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, resolve } from "node:path";

import type { RuntimeDoctorDiagnostic } from "./extension.js";

function pathLike(value: string): boolean {
  return isAbsolute(value) || value.includes("/") || value.includes("\\");
}

/** Bare command names remain PATH-resolved; configured relative paths are rooted at the Runtime Profile root. */
export function resolveRuntimeExecutable(root: string, value: string): string {
  return pathLike(value) && !isAbsolute(value) ? resolve(root, value) : value;
}

/** True when the last path segment has an extension: a `.` followed by at least one character. */
function hasExtension(value: string): boolean {
  const segment = value.slice(Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\")) + 1);
  const dot = segment.indexOf(".");
  return dot !== -1 && dot < segment.length - 1;
}

async function executableExists(value: string): Promise<boolean> {
  const unavailable = (error: unknown) => error instanceof Error && "code" in error
    && ["ENOENT", "ENOTDIR", "EACCES"].includes(String(error.code));
  const extensions = process.platform === "win32" && !hasExtension(value)
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [];
  const candidates = (base: string, suffixes: readonly string[]) =>
    (suffixes.length === 0 ? [""] : suffixes).map((suffix) => `${base}${suffix}`);
  const available = async (candidate: string): Promise<boolean> => {
    try {
      await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return true;
    } catch (error) {
      if (unavailable(error)) return false;
      throw error;
    }
  };
  if (pathLike(value)) {
    for (const candidate of candidates(value, ["", ...extensions])) if (await available(candidate)) return true;
    return false;
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const candidate of candidates(resolve(directory, value), extensions)) {
      if (await available(candidate)) return true;
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

/** Executables inside a Python virtual environment have one platform-defined layout. */
export function pythonEnvironmentExecutable(environment: string): string {
  return process.platform === "win32"
    ? resolve(environment, "Scripts", "python.exe")
    : resolve(environment, "bin", "python");
}

/** Console scripts installed by Python use an executable shim on Windows. */
export function pythonEnvironmentCommand(environment: string, name: string): string {
  return process.platform === "win32"
    ? resolve(environment, "Scripts", `${name}.exe`)
    : resolve(environment, "bin", name);
}
