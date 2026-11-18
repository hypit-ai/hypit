import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export function nodeHypitDataRoot(): string {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Hypit");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Hypit");
  const xdgDataHome = process.env.XDG_DATA_HOME;
  return join(xdgDataHome && isAbsolute(xdgDataHome) ? xdgDataHome : join(homedir(), ".local", "share"), "hypit");
}
