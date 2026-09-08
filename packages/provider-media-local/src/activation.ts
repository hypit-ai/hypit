import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";
import {
  diagnoseRuntimeExecutable,
  resolveRuntimeExecutable,
} from "@hypit/runtime-host-node";

import { createLocalMediaProvider } from "./provider.js";
import { localMediaToolchainProgram } from "./program.js";

const localMediaRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-media-local",
  activate(context) {
    if (context.pool === undefined) throw new Error("local media Provider Pool is required");
    const config = runtimeConfigObject(context.config, "local media");
    runtimeConfigExact(config, [
      "ffmpegPath", "ffprobePath", "defaultConcurrency", "processTimeoutMs", "maxProbeOutputBytes",
    ], "local media");
    const configuredFfmpeg = runtimeConfigString(config.ffmpegPath, "media ffmpegPath");
    const configuredFfprobe = runtimeConfigString(config.ffprobePath, "media ffprobePath");
    const ffmpegPath = resolveRuntimeExecutable(context.dataRoot, configuredFfmpeg ?? "ffmpeg");
    const ffprobePath = resolveRuntimeExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "media defaultConcurrency");
    const processTimeoutMs = runtimeConfigPositiveInteger(config.processTimeoutMs, "media processTimeoutMs");
    const maxProbeOutputBytes = runtimeConfigPositiveInteger(config.maxProbeOutputBytes, "media maxProbeOutputBytes");
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
        ...await diagnoseRuntimeExecutable({
          root: context.dataRoot,
          configured: configuredFfmpeg,
          fallback: "ffmpeg",
          subject: "FFmpeg",
        }),
        ...await diagnoseRuntimeExecutable({
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
  format: "hypit.node-package@1" as const,
  hostFacets: [localMediaRuntimeAdapter],
};

export default hypitPackage;
