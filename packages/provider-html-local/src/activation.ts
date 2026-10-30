import { resolve } from "node:path";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-local/extension";
import {
  diagnoseRuntimeExecutable,
  resolveRuntimeExecutable,
} from "@hypit/runtime-local/node";

import {
  createLocalChromiumHtmlProvider,
  createLocalElectronHtmlProvider,
} from "./provider.js";
import { configuredBrowserPath, browserExecutablePath, selectedBrowserVersion } from "./browser.js";
import type { HtmlBrowserGpu, HtmlWorkers } from "./provider.js";
import {
  localChromiumHtmlRendererProgram,
  localElectronHtmlRendererProgram,
} from "./program.js";

export type LocalHtmlRuntimeAdapterKind = "chromium" | "electron";

const executionKeys = [
  "ffprobePath", "ffmpegPath", "workers", "maxWorkers", "browserGpu",
  "defaultConcurrency", "browserCapacity", "initializationTimeoutMs", "frameTimeoutMs",
  "processTimeoutMs", "maxProcessOutputBytes", "artifactStagingConcurrency",
  "maxPendingFrameBytes", "maxDecodedSourceBytes", "maxRenderedBytes",
] as const;

/**
 * Construct one fixed Runtime Adapter identity. Renderer choice belongs to the package/Endpoint
 * selected by the Profile; it is never a request-time branch or a config switch inside that port.
 */
export function createLocalHtmlRuntimeAdapterFacet(options: {
  readonly use: string;
  readonly kind: LocalHtmlRuntimeAdapterKind;
}) {
  return createRuntimeEndpointAdapterFacet({
    use: options.use,
    activate(context) {
      if (context.pool === undefined) throw new Error("local HTML renderer Provider Pool is required");
      const label = options.kind === "chromium" ? "local Chromium HTML renderer" : "local Electron HTML renderer";
      const config = runtimeConfigObject(context.config, label);
      runtimeConfigExact(config, options.kind === "chromium"
        ? ["nodePath", "chromePath", "browserVersion", "browserCacheDirectory", "browserDownloadBaseUrl", ...executionKeys]
        : ["electronPath", ...executionKeys], label);

      const workers = config.workers;
      if (workers !== undefined && workers !== "auto") runtimeConfigPositiveInteger(workers, "HTML renderer workers");
      const browserGpu = runtimeConfigString(config.browserGpu, "HTML renderer browserGpu");
      if (browserGpu !== undefined && browserGpu !== "auto" && browserGpu !== "software" && browserGpu !== "hardware") {
        throw new Error("HTML renderer browserGpu is invalid");
      }
      const configuredFfprobe = runtimeConfigString(config.ffprobePath, "HTML renderer ffprobePath");
      const configuredFfmpeg = runtimeConfigString(config.ffmpegPath, "HTML renderer ffmpegPath");
      const ffmpegPath = resolveRuntimeExecutable(context.dataRoot, configuredFfmpeg ?? "ffmpeg");
      const ffprobePath = resolveRuntimeExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
      const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "HTML renderer defaultConcurrency");
      const maxWorkers = runtimeConfigPositiveInteger(config.maxWorkers, "HTML renderer maxWorkers");
      const browserCapacity = runtimeConfigPositiveInteger(config.browserCapacity, "HTML renderer browserCapacity");
      const initializationTimeoutMs = runtimeConfigPositiveInteger(config.initializationTimeoutMs, "HTML renderer initializationTimeoutMs");
      const frameTimeoutMs = runtimeConfigPositiveInteger(config.frameTimeoutMs, "HTML renderer frameTimeoutMs");
      const processTimeoutMs = runtimeConfigPositiveInteger(config.processTimeoutMs, "HTML renderer processTimeoutMs");
      const maxProcessOutputBytes = runtimeConfigPositiveInteger(config.maxProcessOutputBytes, "HTML renderer maxProcessOutputBytes");
      const artifactStagingConcurrency = runtimeConfigPositiveInteger(config.artifactStagingConcurrency, "HTML renderer artifactStagingConcurrency");
      const maxPendingFrameBytes = runtimeConfigPositiveInteger(config.maxPendingFrameBytes, "HTML renderer maxPendingFrameBytes");
      const maxDecodedSourceBytes = runtimeConfigPositiveInteger(config.maxDecodedSourceBytes, "HTML renderer maxDecodedSourceBytes");
      const maxRenderedBytes = runtimeConfigPositiveInteger(config.maxRenderedBytes, "HTML renderer maxRenderedBytes");
      const shared = {
        instance: context.instance,
        pool: context.pool,
        ffprobePath,
        ffmpegPath,
        ...(workers === undefined ? {} : { workers: workers as HtmlWorkers }),
        ...(maxWorkers === undefined ? {} : { maxWorkers }),
        ...(browserGpu === undefined ? {} : { browserGpu: browserGpu as HtmlBrowserGpu }),
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(browserCapacity === undefined ? {} : { browserCapacity }),
        ...(initializationTimeoutMs === undefined ? {} : { initializationTimeoutMs }),
        ...(frameTimeoutMs === undefined ? {} : { frameTimeoutMs }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxProcessOutputBytes === undefined ? {} : { maxProcessOutputBytes }),
        ...(artifactStagingConcurrency === undefined ? {} : { artifactStagingConcurrency }),
        ...(maxPendingFrameBytes === undefined ? {} : { maxPendingFrameBytes }),
        ...(maxDecodedSourceBytes === undefined ? {} : { maxDecodedSourceBytes }),
        ...(maxRenderedBytes === undefined ? {} : { maxRenderedBytes }),
      };

      if (options.kind === "electron") {
        const configuredElectron = runtimeConfigString(config.electronPath, "HTML renderer electronPath");
        if (configuredElectron === undefined) throw new Error("local Electron HTML renderer requires electronPath");
        const electronPath = resolve(context.dataRoot, configuredElectron);
        return {
          endpoint: createLocalElectronHtmlProvider({ ...shared, electronPath }),
          program: localElectronHtmlRendererProgram({ id: context.instance, electronPath, ffprobePath, ffmpegPath }),
          diagnose: async () => [
            { severity: "info" as const, code: "HTML_RENDERER_SELECTION", subject: context.instance,
              message: `Electron shared-texture renderer: ${electronPath}` },
            ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredFfmpeg, fallback: "ffmpeg", subject: "FFmpeg" }),
            ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredFfprobe, fallback: "ffprobe", subject: "FFprobe" }),
          ],
        };
      }

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

const localHTMLRuntimeAdapter = createLocalHtmlRuntimeAdapterFacet({
  use: "@hypit/provider-html-local",
  kind: "chromium",
});

export const hypitPackage = {
  format: "hypit.package@1" as const,
  facets: [localHTMLRuntimeAdapter],
};

export default hypitPackage;
