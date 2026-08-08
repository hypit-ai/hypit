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

const localMediaRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-media-local",
  validate(context) {
    const config = runtimeConfigObject(context.config, "local media");
    runtimeConfigExact(config, [
      "ffmpegPath", "ffprobePath", "defaultConcurrency", "processTimeoutMs", "maxProbeOutputBytes",
    ], "local media");
    runtimeConfigString(config.ffmpegPath, "media ffmpegPath");
    runtimeConfigString(config.ffprobePath, "media ffprobePath");
    runtimeConfigPositiveInteger(config.defaultConcurrency, "media defaultConcurrency");
    runtimeConfigPositiveInteger(config.processTimeoutMs, "media processTimeoutMs");
    runtimeConfigPositiveInteger(config.maxProbeOutputBytes, "media maxProbeOutputBytes");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "local media");
    runtimeConfigExact(config, [
      "ffmpegPath", "ffprobePath", "defaultConcurrency", "processTimeoutMs", "maxProbeOutputBytes",
    ], "local media");
    const configuredFfmpeg = runtimeConfigString(config.ffmpegPath, "media ffmpegPath");
    const configuredFfprobe = runtimeConfigString(config.ffprobePath, "media ffprobePath");
    const ffmpegPath = configuredFfmpeg === undefined ? undefined : resolveRuntimeExecutable(context.root, configuredFfmpeg);
    const ffprobePath = configuredFfprobe === undefined ? undefined : resolveRuntimeExecutable(context.root, configuredFfprobe);
    return createLocalMediaProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(ffmpegPath === undefined ? {} : { ffmpegPath }),
      ...(ffprobePath === undefined ? {} : { ffprobePath }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "media defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(runtimeConfigPositiveInteger(config.processTimeoutMs, "media processTimeoutMs") === undefined
        ? {} : { processTimeoutMs: config.processTimeoutMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxProbeOutputBytes, "media maxProbeOutputBytes") === undefined
        ? {} : { maxProbeOutputBytes: config.maxProbeOutputBytes as number }),
    });
  },
  async doctor(context) {
    const config = runtimeConfigObject(context.config, "local media");
    return [
      ...await diagnoseRuntimeExecutable({
        root: context.root,
        configured: runtimeConfigString(config.ffmpegPath, "media ffmpegPath"),
        fallback: "ffmpeg",
        subject: "FFmpeg",
      }),
      ...await diagnoseRuntimeExecutable({
        root: context.root,
        configured: runtimeConfigString(config.ffprobePath, "media ffprobePath"),
        fallback: "ffprobe",
        subject: "FFprobe",
      }),
    ];
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-media-local",
  hostFacets: [localMediaRuntimeAdapter],
};

export default svmlPackage;
