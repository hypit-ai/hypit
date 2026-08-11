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

import { createLocalHyperframesProvider } from "./provider.js";
import type { HyperframesBrowserGpu, HyperframesQuality, HyperframesWorkers } from "./provider.js";
import { localHyperframesBrowserService } from "./service.js";

const localHyperframesRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-hyperframes-local",
  activate(context) {
    if (context.authority === undefined) throw new Error("local HyperFrames Provider Authority is required");
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
    const nodePath = configuredNode === undefined ? undefined : resolveRuntimeExecutable(context.root, configuredNode);
    const hyperframesCliPath = configuredCli === undefined ? undefined : resolveRuntimeExecutable(context.root, configuredCli);
    const ffprobePath = configuredFfprobe === undefined ? undefined : resolveRuntimeExecutable(context.root, configuredFfprobe);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "HyperFrames defaultConcurrency");
    const processTimeoutMs = runtimeConfigPositiveInteger(config.processTimeoutMs, "HyperFrames processTimeoutMs");
    const maxProcessOutputBytes = runtimeConfigPositiveInteger(config.maxProcessOutputBytes, "HyperFrames maxProcessOutputBytes");
    const maxRenderedBytes = runtimeConfigPositiveInteger(config.maxRenderedBytes, "HyperFrames maxRenderedBytes");
    return {
      endpoint: createLocalHyperframesProvider({
        instance: context.instance,
        authority: context.authority,
        ...(nodePath === undefined ? {} : { nodePath }),
        ...(hyperframesCliPath === undefined ? {} : { hyperframesCliPath }),
        ...(ffprobePath === undefined ? {} : { ffprobePath }),
        ...(workers === undefined ? {} : { workers: workers as HyperframesWorkers }),
        ...(quality === undefined ? {} : { quality: quality as HyperframesQuality }),
        ...(browserGpu === undefined ? {} : { browserGpu: browserGpu as HyperframesBrowserGpu }),
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxProcessOutputBytes === undefined ? {} : { maxProcessOutputBytes }),
        ...(maxRenderedBytes === undefined ? {} : { maxRenderedBytes }),
      }),
      externalService: localHyperframesBrowserService(context),
      diagnose: async () => [
        ...await diagnoseRuntimeExecutable({
          root: context.root,
          configured: configuredNode,
          fallback: process.execPath,
          subject: "Node.js",
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
  name: "@narratage/provider-hyperframes-local",
  hostFacets: [localHyperframesRuntimeAdapter],
};

export default svmlPackage;
