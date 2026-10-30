import { fileURLToPath } from "node:url";
import type { HtmlFrameImages, HtmlFrameRequest, HtmlRasterRequest } from "@hypit/html-program";
import type { TimelineVisual } from "@hypit/media";
import {
  rasterizeHtmlWithBackend,
  resolveLocalHtmlExecutionOptions,
} from "@hypit/html-render-local";
import type {
  CaptureWorkerLaunch,
  HtmlExecutionOptions,
  HtmlRasterOptions,
  HtmlRasterProgress,
} from "@hypit/html-render-local";
import {
  browserCacheDirectory,
  browserExecutablePath,
  configuredBrowserPath,
  requireBrowserExecutable,
  selectedBrowserVersion,
} from "./browser.js";
import type { BrowserOptions } from "./browser.js";

export type { HtmlRasterProgress };
export type ChromiumHtmlRasterOptions = HtmlRasterOptions & BrowserOptions;

export function resolveExecutionOptions(options: HtmlExecutionOptions & BrowserOptions) {
  return {
    ...resolveLocalHtmlExecutionOptions(options),
    chromePath: configuredBrowserPath(options),
    browserVersion: selectedBrowserVersion(options),
    browserCacheDirectory: browserCacheDirectory(options),
  };
}

function chromiumWorkerLaunch(executablePath: string): CaptureWorkerLaunch {
  return {
    executable: process.execPath,
    args: [
      "--import", import.meta.resolve("tsx"),
      fileURLToPath(new URL("./capture-worker.js", import.meta.url)),
      executablePath,
    ],
    detached: process.platform !== "win32",
  };
}

function backend(options: BrowserOptions) {
  const executablePath = browserExecutablePath(options);
  return {
    mode: "frame-buffer" as const,
    label: "opaque Chromium PNG",
    executablePath,
    workerLaunch: () => chromiumWorkerLaunch(executablePath),
    verifyExecutable: async () => { await requireBrowserExecutable(executablePath, selectedBrowserVersion(options)); },
  };
}

export async function rasterizeChromiumHtmlProgram(
  request: HtmlRasterRequest,
  options: ChromiumHtmlRasterOptions,
): Promise<TimelineVisual> {
  return await rasterizeHtmlWithBackend(request, options, backend(options));
}

export async function rasterizeHtmlFrames(
  request: HtmlFrameRequest,
  options: ChromiumHtmlRasterOptions,
): Promise<HtmlFrameImages> {
  return await rasterizeHtmlWithBackend(request, options, backend(options));
}
