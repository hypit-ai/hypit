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
      "nodePath", "hyperframesCliPath", "ffprobePath", "workers", "quality", "browserGpu",
      "defaultConcurrency", "processTimeoutMs", "maxProcessOutputBytes", "maxRenderedBytes",
    ], "local HyperFrames");
    runtimeConfigString(config.nodePath, "HyperFrames nodePath");
    runtimeConfigString(config.hyperframesCliPath, "HyperFrames hyperframesCliPath");
    runtimeConfigString(config.ffprobePath, "HyperFrames ffprobePath");
    const workers = config.workers;
    if (workers !== undefined && workers !== "auto") {
      const count = runtimeConfigPositiveInteger(workers, "HyperFrames workers");
      if (count !== undefined && count > 64) throw new Error("HyperFrames workers must not exceed 64");
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
    const ffprobePath = resolveRuntimeExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "HyperFrames defaultConcurrency");
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
        ...(workers === undefined ? {} : { workers: workers as HyperframesWorkers }),
        ...(quality === undefined ? {} : { quality: quality as HyperframesQuality }),
        ...(browserGpu === undefined ? {} : { browserGpu: browserGpu as HyperframesBrowserGpu }),
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxProcessOutputBytes === undefined ? {} : { maxProcessOutputBytes }),
        ...(maxRenderedBytes === undefined ? {} : { maxRenderedBytes }),
      }),
      program: localHyperframesBrowserProgram({
        id: context.instance,
        nodePath,
        hyperframesCliPath,
        ffprobePath,
      }),
      diagnose: async () => [
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
