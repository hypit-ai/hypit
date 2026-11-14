import { resolve } from "node:path";
import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import { diagnoseEnvironmentExecutable } from "@hypit/execution-environment-local/node";
import { localHtmlRuntimeConfig } from "@hypit/html-runtime-local";

import { createLocalElectronHtmlProvider } from "./provider.js";
import { localElectronHtmlRendererProgram } from "./program.js";

const localElectronHTMLRuntimeAdapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-html-electron-local",
  activate(context) {
    if (context.pool === undefined) throw new Error("local Electron HTML renderer Provider Pool is required");
    const { config, configuredFfprobe, configuredFfmpeg, ffmpegPath, ffprobePath, shared } = localHtmlRuntimeConfig(
      context, "local Electron HTML renderer", ["electronPath"]);
    const configuredElectron = executionEnvironmentConfigString(config.electronPath, "HTML renderer electronPath");
    if (configuredElectron === undefined) throw new Error("local Electron HTML renderer requires electronPath");
    const electronPath = resolve(context.dataRoot, configuredElectron);
    return {
      endpoint: createLocalElectronHtmlProvider({ ...shared, electronPath }),
      program: localElectronHtmlRendererProgram({ id: context.instance, electronPath, ffprobePath, ffmpegPath }),
      diagnose: async () => [
        { severity: "info" as const, code: "HTML_RENDERER_SELECTION", subject: context.instance,
          message: `Electron shared-texture renderer: ${electronPath}` },
        ...await diagnoseEnvironmentExecutable({ root: context.dataRoot, configured: configuredFfmpeg,
          fallback: "ffmpeg", subject: "FFmpeg" }),
        ...await diagnoseEnvironmentExecutable({ root: context.dataRoot, configured: configuredFfprobe,
          fallback: "ffprobe", subject: "FFprobe" }),
      ],
    };
  },
});

export const hypitPackage = {
  facets: [localElectronHTMLRuntimeAdapter],
};

export default hypitPackage;
