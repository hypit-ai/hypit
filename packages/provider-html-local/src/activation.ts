import { resolve } from "node:path";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigString,
} from "@hypit/runtime-local/extension";
import {
  diagnoseRuntimeExecutable,
  resolveRuntimeExecutable,
} from "@hypit/runtime-local/node";

import {
  createLocalChromiumHtmlProvider,
} from "./provider.js";
import { configuredBrowserPath, browserExecutablePath, selectedBrowserVersion } from "./browser.js";
import { localChromiumHtmlRendererProgram } from "./program.js";
import { localHtmlRuntimeConfig } from "./runtime-config.js";

/**
 * Construct one fixed Runtime Adapter identity. Renderer choice belongs to the package/Endpoint
 * selected by the Profile; it is never a request-time branch or a config switch inside that port.
 */
export function createLocalHtmlRuntimeAdapterFacet() {
  return createRuntimeEndpointAdapterFacet({
    use: "@hypit/provider-html-local",
    activate(context) {
      if (context.pool === undefined) throw new Error("local HTML renderer Provider Pool is required");
      const { config, configuredFfprobe, configuredFfmpeg, ffmpegPath, ffprobePath, shared } = localHtmlRuntimeConfig(
        context, "local Chromium HTML renderer",
        ["nodePath", "chromePath", "browserVersion", "browserCacheDirectory", "browserDownloadBaseUrl"]);

      const configuredNode = runtimeConfigString(config.nodePath, "HTML renderer nodePath");
      const nodePath = resolveRuntimeExecutable(context.dataRoot, configuredNode ?? process.execPath);
      const configuredChrome = runtimeConfigString(config.chromePath, "HTML renderer chromePath");
      const browserVersion = runtimeConfigString(config.browserVersion, "HTML renderer browserVersion");
      const browserDownloadBaseUrl = runtimeConfigString(config.browserDownloadBaseUrl, "HTML renderer browserDownloadBaseUrl");
      const configuredCache = runtimeConfigString(config.browserCacheDirectory, "HTML renderer browserCacheDirectory");
      const chromePath = configuredBrowserPath({ ...(configuredChrome === undefined ? {} : {
        chromePath: resolve(context.dataRoot, configuredChrome),
      }) });
      const browser = {
        ...(browserVersion === undefined ? {} : { browserVersion }),
        ...(browserDownloadBaseUrl === undefined ? {} : { browserDownloadBaseUrl }),
        ...(chromePath === undefined ? {} : { chromePath }),
        ...(configuredCache === undefined ? {} : { browserCacheDirectory: resolve(context.dataRoot, configuredCache) }),
      };
      return {
        endpoint: createLocalChromiumHtmlProvider({ ...shared, nodePath, ...browser }),
        program: localChromiumHtmlRendererProgram({ id: context.instance, nodePath, ...browser, ffprobePath, ffmpegPath }),
        diagnose: async () => [
          { severity: "info" as const, code: "HTML_RENDERER_SELECTION", subject: context.instance,
            message: `${chromePath === undefined ? `Managed Chrome Headless Shell ${selectedBrowserVersion(browser)} (${browserVersion === undefined ? "Provider recommendation" : "Profile version"})` : "Profile browser"}: ${browserExecutablePath(browser)}` },
          ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredFfmpeg, fallback: "ffmpeg", subject: "FFmpeg" }),
          ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredNode, fallback: process.execPath, subject: "Node.js" }),
          ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredFfprobe, fallback: "ffprobe", subject: "FFprobe" }),
        ],
      };
    },
  });
}

const localHTMLRuntimeAdapter = createLocalHtmlRuntimeAdapterFacet();

export const hypitPackage = {
  format: "hypit.package@1" as const,
  facets: [localHTMLRuntimeAdapter],
};

export default hypitPackage;
