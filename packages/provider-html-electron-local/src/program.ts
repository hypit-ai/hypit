import type { ManagedProgram } from "@hypit/runtime-local/extension";
import {
  probeHtmlMediaTools,
} from "@hypit/provider-html-local/execution";

import { requireElectronExecutable } from "./electron.js";

/** User-managed executable and media-tool probes for the Electron Endpoint. */
export function localElectronHtmlRendererProgram(input: {
  readonly id: string;
  readonly electronPath: string;
  readonly ffprobePath: string;
  readonly ffmpegPath?: string;
}): ManagedProgram {
  return {
    id: input.id,
    async probe() {
      try { await requireElectronExecutable(input.electronPath); }
      catch (error) { return { state: "down", detail: error instanceof Error ? error.message : String(error) }; }
      return probeHtmlMediaTools(input.ffprobePath, input.ffmpegPath);
    },
  };
}
