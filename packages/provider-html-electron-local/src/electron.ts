import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { promisify } from "node:util";

export function electronEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  return env;
}

export async function requireElectronExecutable(path: string): Promise<string> {
  try {
    if (!(await stat(path)).isFile()) throw new Error("Electron path is not a file");
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    const { stdout } = await promisify(execFile)(path, ["-p", "process.versions.electron"], {
      timeout: 15_000,
      windowsHide: true,
      env: { ...electronEnvironment(), ELECTRON_RUN_AS_NODE: "1" },
    });
    const version = stdout.trim();
    if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/u.test(version)) throw new Error(`Electron returned invalid version ${version}`);
    if (Number(version.split(".")[0]) < 45) {
      throw new Error(`Electron ${version} does not provide the required shared-texture API; version 45 or newer is required`);
    }
    return version;
  } catch (error) {
    throw new Error(`HTML renderer Electron is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error });
  }
}
