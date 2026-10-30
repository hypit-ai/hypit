import { fileURLToPath } from "node:url";
import type { HtmlRasterRequest } from "@hypit/html-program";
import type { TimelineVisual } from "@hypit/media";
import {
  rasterizeHtmlProgramWithBackend,
} from "@hypit/provider-html-local/execution";
import type {
  CaptureWorkerLaunch,
  HtmlRasterOptions,
  HtmlRasterProgress,
} from "@hypit/provider-html-local/execution";

import { electronEnvironment, requireElectronExecutable } from "./electron.js";

export type { HtmlRasterProgress };

export type ElectronHtmlRasterOptions = HtmlRasterOptions & {
  /** User-managed executable selected by the Runtime Profile. */
  readonly electronPath: string;
};

function electronWorkerLaunch(electronPath: string, directory: string, entry: URL): CaptureWorkerLaunch {
  return {
    executable: electronPath,
    args: [fileURLToPath(new URL("../runtime/gpu-worker.cjs", import.meta.url)), directory, entry.href],
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
  return rasterizeHtmlProgramWithBackend(request, options, {
    kind: "shared-texture",
    executablePath: electronPath,
    workerEntry: new URL("./capture-worker.js", import.meta.url),
    workerLaunch: (directory, entry) => electronWorkerLaunch(electronPath, directory, entry),
    verifyExecutable: async () => { await requireElectronExecutable(electronPath); },
  });
}
