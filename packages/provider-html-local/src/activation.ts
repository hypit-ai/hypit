import { resolve } from "node:path";
import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import {
  diagnoseEnvironmentExecutable,
  resolveEnvironmentExecutable,
} from "@hypit/execution-environment-local/node";
import { localHtmlRuntimeConfig } from "@hypit/html-runtime-local";

import {
  createLocalChromiumHtmlProvider,
} from "./provider.js";
import { configuredBrowserPath, browserExecutablePath, selectedBrowserVersion } from "@hypit/html-chromium-local";
import { localChromiumHtmlRendererProgram } from "./program.js";

/**
 * Construct one fixed Environment Adapter identity. Renderer choice belongs to the package/Endpoint
 * selected by the Profile; it is never a request-time branch or a config switch inside that port.
 */
export function createLocalHtmlExecutionEnvironmentAdapterFacet() {
  return createExecutionEnvironmentEndpointAdapterFacet({
    use: "@hypit/provider-html-local",
    activate(context) {
      if (context.pool === undefined) throw new Error("local HTML renderer Provider Pool is required");
      const { config, configuredFfprobe, configuredFfmpeg, ffmpegPath, ffprobePath, shared } = localHtmlRuntimeConfig(
        context, "local Chromium HTML renderer",
        ["nodePath", "chromePath", "browserVersion", "browserCacheDirectory", "browserDownloadBaseUrl"]);

      const configuredNode = executionEnvironmentConfigString(config.nodePath, "HTML renderer nodePath");
      const nodePath = resolveEnvironmentExecutable(context.dataRoot, configuredNode ?? process.execPath);
      const configuredChrome = executionEnvironmentConfigString(config.chromePath, "HTML renderer chromePath");
      const browserVersion = executionEnvironmentConfigString(config.browserVersion, "HTML renderer browserVersion");
      const browserDownloadBaseUrl = executionEnvironmentConfigString(config.browserDownloadBaseUrl, "HTML renderer browserDownloadBaseUrl");
      const configuredCache = executionEnvironmentConfigString(config.browserCacheDirectory, "HTML renderer browserCacheDirectory");
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
          ...await diagnoseEnvironmentExecutable({ root: context.dataRoot, configured: configuredFfmpeg, fallback: "ffmpeg", subject: "FFmpeg" }),
          ...await diagnoseEnvironmentExecutable({ root: context.dataRoot, configured: configuredNode, fallback: process.execPath, subject: "Node.js" }),
          ...await diagnoseEnvironmentExecutable({ root: context.dataRoot, configured: configuredFfprobe, fallback: "ffprobe", subject: "FFprobe" }),
        ],
      };
    },
  });
}

const localHTMLRuntimeAdapter = createLocalHtmlExecutionEnvironmentAdapterFacet();

export const hypitPackage = {
  facets: [localHTMLRuntimeAdapter],
};

export default hypitPackage;
