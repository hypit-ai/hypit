import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import {
  diagnoseEnvironmentExecutable,
  resolveEnvironmentExecutable,
} from "@hypit/execution-environment-local/node";

import { createLocalMediaProvider } from "./provider.js";
import { localMediaToolchainProgram } from "./program.js";

const localMediaRuntimeAdapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-media-local",
  activate(context) {
    if (context.pool === undefined) throw new Error("local media Provider Pool is required");
    const config = executionEnvironmentConfigObject(context.config, "local media");
    executionEnvironmentConfigExact(config, [
      "ffmpegPath", "ffprobePath", "defaultConcurrency", "processTimeoutMs", "maxProbeOutputBytes",
    ], "local media");
    const configuredFfmpeg = executionEnvironmentConfigString(config.ffmpegPath, "media ffmpegPath");
    const configuredFfprobe = executionEnvironmentConfigString(config.ffprobePath, "media ffprobePath");
    const ffmpegPath = resolveEnvironmentExecutable(context.dataRoot, configuredFfmpeg ?? "ffmpeg");
    const ffprobePath = resolveEnvironmentExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
    const defaultConcurrency = executionEnvironmentConfigPositiveInteger(config.defaultConcurrency, "media defaultConcurrency");
    const processTimeoutMs = executionEnvironmentConfigPositiveInteger(config.processTimeoutMs, "media processTimeoutMs");
    const maxProbeOutputBytes = executionEnvironmentConfigPositiveInteger(config.maxProbeOutputBytes, "media maxProbeOutputBytes");
    return {
      endpoint: createLocalMediaProvider({
        instance: context.instance,
        pool: context.pool,
        ffmpegPath,
        ffprobePath,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxProbeOutputBytes === undefined ? {} : { maxProbeOutputBytes }),
      }),
      program: localMediaToolchainProgram({ id: context.instance, ffmpegPath, ffprobePath }),
      diagnose: async () => [
        ...await diagnoseEnvironmentExecutable({
          root: context.dataRoot,
          configured: configuredFfmpeg,
          fallback: "ffmpeg",
          subject: "FFmpeg",
        }),
        ...await diagnoseEnvironmentExecutable({
          root: context.dataRoot,
          configured: configuredFfprobe,
          fallback: "ffprobe",
          subject: "FFprobe",
        }),
      ],
    };
  },
});

export const hypitPackage = {
  facets: [localMediaRuntimeAdapter],
};

export default hypitPackage;
