import { spawnSync } from "node:child_process";

export type BlenderRuntime = {
  readonly executable: string;
  readonly version: string;
};

function defaultBlenderPath(): string {
  return process.platform === "darwin"
    ? "/Applications/Blender.app/Contents/MacOS/Blender"
    : process.platform === "win32" ? "blender.exe" : "blender";
}

/** Read-only probe of one explicitly selected local Blender installation. */
export function requireBlenderRuntime(blenderPath = defaultBlenderPath()): BlenderRuntime {
  const result = spawnSync(blenderPath, ["--background", "--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  const version = /^Blender\s+([^\s]+)/mu.exec(result.stdout ?? "")?.[1];
  if (result.status !== 0 || version === undefined) {
    throw new Error(`Blender is not ready at ${blenderPath}. `
      + `${result.error?.message ?? result.stderr?.trim() ?? "Install or explicitly select Blender first."}`);
  }
  return { executable: blenderPath, version };
}
