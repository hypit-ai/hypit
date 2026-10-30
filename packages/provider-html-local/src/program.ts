import { fileURLToPath } from "node:url";
import { join } from "node:path";

import type { ManagedProgram, ManagedProgramState } from "@hypit/runtime-local/extension";
import { probeHtmlMediaTools } from "@hypit/html-render-local";
import { browserCacheDirectory, browserDownloadBaseUrl, browserDownloadUrl, browserExecutablePath, configuredBrowserPath, requireBrowserExecutable, selectedBrowserVersion } from "./browser.js";
import type { BrowserOptions } from "./browser.js";

/**
 * This Provider owns browser selection and preparation. Probes never install;
 * rasterization receives the same selected executable instead of invoking browser discovery.
 */
function localHtmlRendererProgram(input: BrowserOptions & {
  readonly id: string;
  readonly nodePath: string;
  readonly ffprobePath: string;
  readonly ffmpegPath?: string;
}): ManagedProgram {
  const version = selectedBrowserVersion(input);
  const selectedPath = browserExecutablePath(input);
  const baseUrl = browserDownloadBaseUrl(input);
  const probeBrowser = async (): Promise<ManagedProgramState> => {
    if (selectedPath === undefined) return { state: "ready" };
    try { await requireBrowserExecutable(selectedPath, version); }
    catch (error) { return { state: "down", detail: error instanceof Error ? error.message : String(error) }; }
    return { state: "ready" };
  };
  const managedChrome = configuredBrowserPath(input) === undefined;
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
      const browser = await probeBrowser();
      if (browser.state !== "ready") return browser;
      return await probeHtmlMediaTools(input.ffprobePath, input.ffmpegPath);
    },
  };
}

type LocalHtmlProgramOptions = {
  readonly id: string;
  readonly ffprobePath: string;
  readonly ffmpegPath?: string;
};

/** Managed dependencies for the portable Chromium Endpoint. */
export function localChromiumHtmlRendererProgram(
  input: BrowserOptions & LocalHtmlProgramOptions & { readonly nodePath: string },
): ManagedProgram {
  return localHtmlRendererProgram(input);
}
