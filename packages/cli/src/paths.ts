import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function narratageHostStateRoot(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
} = {}): string {
  const env = options.env ?? process.env;
  const override = env.NARRATAGE_STATE_HOME;
  if (override !== undefined && override.trim().length > 0) return resolve(override);
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  if (platform === "darwin") return join(home, "Library", "Application Support", "Narratage");
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    return join(local === undefined || local.trim().length === 0
      ? join(home, "AppData", "Local")
      : local, "Narratage");
  }
  const state = env.XDG_STATE_HOME;
  return join(state === undefined || state.trim().length === 0
    ? join(home, ".local", "state")
    : state, "narratage");
}

export function narratageProjectStateRoot(projectRoot: string): string {
  return resolve(projectRoot, ".narratage");
}
