import { fileURLToPath } from "node:url";
import { join } from "node:path";

import type { ManagedProgram, ManagedProgramState } from "@hypit/runtime-local/extension";
import { browserCacheDirectory, browserDownloadBaseUrl, browserDownloadUrl, browserExecutablePath, configuredBrowserPath, requireBrowserExecutable, selectedBrowserVersion } from "./browser.js";
import type { BrowserOptions } from "./browser.js";
import { runProcess } from "./process.js";
import { electronExecutablePath, requireElectronExecutable, selectedHtmlRenderer } from "./electron.js";
import type { ElectronOptions } from "./electron.js";

type MediaToolVersion =
  | { readonly state: "ready"; readonly version: string }
  | { readonly state: "down" | "mismatch"; readonly detail: string };

async function mediaToolVersion(path: string): Promise<MediaToolVersion> {
  try {
    const result = await runProcess({
      executable: path,
      argv: ["-version"],
      timeoutMs: 15_000,
      maxOutputBytes: 4 * 1024 * 1024,
    });
    const version = Buffer.from(result.stdout).toString("utf8").split(/\r?\n/u, 1)[0]?.trim() ?? "";
    return version.length > 0
      ? { state: "ready", version }
      : { state: "mismatch", detail: `${path} returned no version` };
  } catch (error) {
    return { state: "down", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function probeHtmlMediaTools(ffprobePath: string, ffmpegPath?: string): Promise<ManagedProgramState> {
  const ffprobe = await mediaToolVersion(ffprobePath);
  if (ffprobe.state !== "ready") return { state: ffprobe.state, detail: ffprobe.detail };
  if (ffmpegPath === undefined) return { state: "ready" };
  const ffmpeg = await mediaToolVersion(ffmpegPath);
  return ffmpeg.state === "ready"
    ? { state: "ready" }
    : { state: ffmpeg.state, detail: ffmpeg.detail };
}

/**
 * This Provider owns browser selection and preparation. Probes never install;
 * rasterization receives the same selected executable instead of invoking browser discovery.
 */
export function localHtmlRendererProgram(
  input: BrowserOptions & ElectronOptions & {
    readonly id: string;
    readonly nodePath: string;
    readonly ffprobePath: string;
    readonly ffmpegPath?: string;
  },
): ManagedProgram {
  const renderer = selectedHtmlRenderer(input);
  const version = renderer === "chromium" ? selectedBrowserVersion(input) : undefined;
  const selectedPath = renderer === "chromium" ? browserExecutablePath(input) : undefined;
  const baseUrl = renderer === "chromium" ? browserDownloadBaseUrl(input) : undefined;
  const electronPath = electronExecutablePath(input);
  const probeBrowser = async (): Promise<ManagedProgramState> => {
    if (selectedPath === undefined) return { state: "ready" };
    try { await requireBrowserExecutable(selectedPath, version); }
    catch (error) { return { state: "down", detail: error instanceof Error ? error.message : String(error) }; }
    return { state: "ready" };
  };
  const probeElectron = async (): Promise<ManagedProgramState> => {
    if (electronPath === undefined) return { state: "ready" };
    try { await requireElectronExecutable(electronPath); return { state: "ready" }; }
    catch (error) { return { state: "down", detail: error instanceof Error ? error.message : String(error) }; }
  };
  const managedChrome = renderer === "chromium" && configuredBrowserPath(input) === undefined;
  return {
    id: input.id,
    ...(managedChrome ? {
      // Projects sharing this installation also share the existing Program lifecycle lock/logs.
      stateRoot: join(browserCacheDirectory(input), ".hypit-html-browser-program"),
      installation: {
        probe: probeBrowser,
        commands: [{ label: `Install Chrome Headless Shell ${version} at ${selectedPath} from ${browserDownloadUrl(input)}`, command: input.nodePath, args: [
          "--import", import.meta.resolve("tsx"),
          fileURLToPath(new URL("./browser-install.js", import.meta.url)), browserCacheDirectory(input), version!,
          ...(baseUrl === undefined ? [] : [baseUrl]),
        ] }],
      },
    } : {}),
    async probe(): Promise<ManagedProgramState> {
      const electron = await probeElectron();
      if (electron.state !== "ready") return electron;
      const browser = await probeBrowser();
      if (browser.state !== "ready") return browser;
      return await probeHtmlMediaTools(input.ffprobePath, input.ffmpegPath);
    },
  };
}
