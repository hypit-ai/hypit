import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import {
  diagnoseRuntimeExecutable,
  resolveRuntimeExecutable,
} from "@narratage/runtime-adapter-node";

import { createLocalMediaProvider } from "./provider.js";
import { localMediaToolchainService } from "./service.js";

const localMediaRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-media-local",
  activate(context) {
    if (context.authority === undefined) throw new Error("local media Provider Authority is required");
    const config = runtimeConfigObject(context.config, "local media");
    runtimeConfigExact(config, [
      "ffmpegPath", "ffprobePath", "defaultConcurrency", "processTimeoutMs", "maxProbeOutputBytes",
    ], "local media");
    const configuredFfmpeg = runtimeConfigString(config.ffmpegPath, "media ffmpegPath");
    const configuredFfprobe = runtimeConfigString(config.ffprobePath, "media ffprobePath");
    const ffmpegPath = configuredFfmpeg === undefined ? undefined : resolveRuntimeExecutable(context.root, configuredFfmpeg);
    const ffprobePath = configuredFfprobe === undefined ? undefined : resolveRuntimeExecutable(context.root, configuredFfprobe);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "media defaultConcurrency");
    const processTimeoutMs = runtimeConfigPositiveInteger(config.processTimeoutMs, "media processTimeoutMs");
    const maxProbeOutputBytes = runtimeConfigPositiveInteger(config.maxProbeOutputBytes, "media maxProbeOutputBytes");
    return {
      endpoint: createLocalMediaProvider({
        instance: context.instance,
        authority: context.authority,
        ...(ffmpegPath === undefined ? {} : { ffmpegPath }),
        ...(ffprobePath === undefined ? {} : { ffprobePath }),
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxProbeOutputBytes === undefined ? {} : { maxProbeOutputBytes }),
      }),
      externalService: localMediaToolchainService(context),
      diagnose: async () => [
        ...await diagnoseRuntimeExecutable({
          root: context.root,
          configured: configuredFfmpeg,
          fallback: "ffmpeg",
          subject: "FFmpeg",
        }),
        ...await diagnoseRuntimeExecutable({
          root: context.root,
          configured: configuredFfprobe,
          fallback: "ffprobe",
          subject: "FFprobe",
        }),
      ],
    };
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  hostFacets: [localMediaRuntimeAdapter],
};

export default svmlPackage;
