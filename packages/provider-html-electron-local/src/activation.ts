import { resolve } from "node:path";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigString,
} from "@hypit/runtime-local/extension";
import { diagnoseRuntimeExecutable } from "@hypit/runtime-local/node";
import { localHtmlRuntimeConfig } from "@hypit/provider-html-local/execution";

import { createLocalElectronHtmlProvider } from "./provider.js";
import { localElectronHtmlRendererProgram } from "./program.js";

const localElectronHTMLRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-html-electron-local",
  activate(context) {
    if (context.pool === undefined) throw new Error("local Electron HTML renderer Provider Pool is required");
    const { config, configuredFfprobe, configuredFfmpeg, ffmpegPath, ffprobePath, shared } = localHtmlRuntimeConfig(
      context, "local Electron HTML renderer", ["electronPath"]);
    const configuredElectron = runtimeConfigString(config.electronPath, "HTML renderer electronPath");
    if (configuredElectron === undefined) throw new Error("local Electron HTML renderer requires electronPath");
    const electronPath = resolve(context.dataRoot, configuredElectron);
    return {
      endpoint: createLocalElectronHtmlProvider({ ...shared, electronPath }),
      program: localElectronHtmlRendererProgram({ id: context.instance, electronPath, ffprobePath, ffmpegPath }),
      diagnose: async () => [
        { severity: "info" as const, code: "HTML_RENDERER_SELECTION", subject: context.instance,
          message: `Electron shared-texture renderer: ${electronPath}` },
        ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredFfmpeg,
          fallback: "ffmpeg", subject: "FFmpeg" }),
        ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredFfprobe,
          fallback: "ffprobe", subject: "FFprobe" }),
      ],
    };
  },
});

export const hypitPackage = {
  format: "hypit.package@1" as const,
  facets: [localElectronHTMLRuntimeAdapter],
};

export default hypitPackage;
