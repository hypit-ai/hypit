import { fileURLToPath } from "node:url";
import type { HtmlRasterRequest } from "@hypit/html-program";
import type { TimelineVisual } from "@hypit/media";
import {
  rasterizeHtmlWithBackend,
} from "@hypit/html-render-local";
import type {
  CaptureWorkerLaunch,
  HtmlRasterOptions,
  HtmlRasterProgress,
} from "@hypit/html-render-local";

import { electronEnvironment, requireElectronExecutable } from "./electron.js";

export type { HtmlRasterProgress };

export type ElectronHtmlRasterOptions = HtmlRasterOptions & {
  /** User-managed executable selected by the Runtime Profile. */
  readonly electronPath: string;
};

function electronWorkerLaunch(electronPath: string, directory: string): CaptureWorkerLaunch {
  return {
    executable: electronPath,
    args: [fileURLToPath(new URL("../runtime/gpu-worker.cjs", import.meta.url)), directory,
      new URL("./capture-worker.js", import.meta.url).href],
    env: electronEnvironment(),
    // A local Runtime Worker already belongs to the user's login session. Starting a second
    // macOS AppKit session aborts Electron during registration; Linux keeps its own process group.
    detached: process.platform === "linux",
  };
}

export async function rasterizeElectronHtmlProgram(
  request: HtmlRasterRequest,
  options: ElectronHtmlRasterOptions,
): Promise<TimelineVisual> {
  const electronPath = options.electronPath.trim();
  if (electronPath.length === 0) throw new Error("Electron rendering requires an explicit electronPath");
  return rasterizeHtmlWithBackend(request, options, {
    mode: "encoded-stream",
    label: "Electron shared GPU texture",
    requiresHardwareGpu: true,
    encodedPipeline: "browser decode, WebCodecs H.264 and FFmpeg mux",
    executablePath: electronPath,
    workerLaunch: directory => electronWorkerLaunch(electronPath, directory),
    verifyExecutable: async () => { await requireElectronExecutable(electronPath); },
  });
}
