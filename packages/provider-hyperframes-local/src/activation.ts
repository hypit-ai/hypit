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

import { createLocalHyperframesProvider } from "./provider.js";
import { defaultHyperframesCliPath } from "./provider.js";
import type { HyperframesBrowserGpu, HyperframesQuality, HyperframesWorkers } from "./provider.js";
import { localHyperframesBrowserProgram } from "./program.js";

const localHyperframesRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-hyperframes-local",
  activate(context) {
    if (context.pool === undefined) throw new Error("local HyperFrames Provider Pool is required");
    const config = runtimeConfigObject(context.config, "local HyperFrames");
    runtimeConfigExact(config, [
      "nodePath", "hyperframesCliPath", "ffprobePath", "ffmpegPath", "workers", "quality", "browserGpu",
      "defaultConcurrency", "browserCapacity", "initializationTimeoutMs", "frameTimeoutMs", "processTimeoutMs", "maxProcessOutputBytes", "maxRenderedBytes",
    ], "local HyperFrames");
    runtimeConfigString(config.nodePath, "HyperFrames nodePath");
    runtimeConfigString(config.hyperframesCliPath, "HyperFrames hyperframesCliPath");
    runtimeConfigString(config.ffprobePath, "HyperFrames ffprobePath");
    const workers = config.workers;
    if (workers !== undefined && workers !== "auto") {
      runtimeConfigPositiveInteger(workers, "HyperFrames workers");
    }
    const quality = runtimeConfigString(config.quality, "HyperFrames quality");
    if (quality !== undefined && quality !== "draft" && quality !== "standard" && quality !== "high") {
      throw new Error("HyperFrames quality is invalid");
    }
    const browserGpu = runtimeConfigString(config.browserGpu, "HyperFrames browserGpu");
    if (browserGpu !== undefined && browserGpu !== "auto" && browserGpu !== "software" && browserGpu !== "hardware") {
      throw new Error("HyperFrames browserGpu is invalid");
    }
    const configuredNode = runtimeConfigString(config.nodePath, "HyperFrames nodePath");
    const configuredCli = runtimeConfigString(config.hyperframesCliPath, "HyperFrames hyperframesCliPath");
    const configuredFfprobe = runtimeConfigString(config.ffprobePath, "HyperFrames ffprobePath");
    const nodePath = resolveRuntimeExecutable(context.dataRoot, configuredNode ?? process.execPath);
    const hyperframesCliPath = resolveRuntimeExecutable(context.dataRoot, configuredCli ?? defaultHyperframesCliPath());
    const configuredFfmpeg = runtimeConfigString(config.ffmpegPath, "HyperFrames ffmpegPath");
    const ffmpegPath = resolveRuntimeExecutable(context.dataRoot, configuredFfmpeg ?? "ffmpeg");
    const ffprobePath = resolveRuntimeExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "HyperFrames defaultConcurrency");
    const browserCapacity = runtimeConfigPositiveInteger(config.browserCapacity, "HyperFrames browserCapacity");
    const initializationTimeoutMs = runtimeConfigPositiveInteger(config.initializationTimeoutMs, "HyperFrames initializationTimeoutMs");
    const frameTimeoutMs = runtimeConfigPositiveInteger(config.frameTimeoutMs, "HyperFrames frameTimeoutMs");
    const processTimeoutMs = runtimeConfigPositiveInteger(config.processTimeoutMs, "HyperFrames processTimeoutMs");
    const maxProcessOutputBytes = runtimeConfigPositiveInteger(config.maxProcessOutputBytes, "HyperFrames maxProcessOutputBytes");
    const maxRenderedBytes = runtimeConfigPositiveInteger(config.maxRenderedBytes, "HyperFrames maxRenderedBytes");
    return {
      endpoint: createLocalHyperframesProvider({
        instance: context.instance,
        pool: context.pool,
        nodePath,
        hyperframesCliPath,
        ffprobePath,
        ffmpegPath,
        ...(workers === undefined ? {} : { workers: workers as HyperframesWorkers }),
        ...(quality === undefined ? {} : { quality: quality as HyperframesQuality }),
        ...(browserGpu === undefined ? {} : { browserGpu: browserGpu as HyperframesBrowserGpu }),
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(browserCapacity === undefined ? {} : { browserCapacity }),
        ...(initializationTimeoutMs === undefined ? {} : { initializationTimeoutMs }),
        ...(frameTimeoutMs === undefined ? {} : { frameTimeoutMs }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxProcessOutputBytes === undefined ? {} : { maxProcessOutputBytes }),
        ...(maxRenderedBytes === undefined ? {} : { maxRenderedBytes }),
      }),
      program: localHyperframesBrowserProgram({
        id: context.instance,
        nodePath,
        hyperframesCliPath,
        ffprobePath,
        ffmpegPath,
      }),
      diagnose: async () => [
        ...await diagnoseRuntimeExecutable({ root: context.dataRoot, configured: configuredFfmpeg, fallback: "ffmpeg", subject: "FFmpeg" }),
        ...await diagnoseRuntimeExecutable({
          root: context.dataRoot,
          configured: configuredNode,
          fallback: process.execPath,
          subject: "Node.js",
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
  hostFacets: [localHyperframesRuntimeAdapter],
};

export default hypitPackage;
