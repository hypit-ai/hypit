import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@svml/runtime-adapter";
import {
  diagnoseRuntimeExecutable,
  resolveRuntimeExecutable,
} from "@svml/runtime-adapter-node";

import { createLocalHyperframesProvider } from "./provider.js";
import type { HyperframesBrowserGpu, HyperframesQuality, HyperframesWorkers } from "./provider.js";

const localHyperframesRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@svml/provider-hyperframes-local",
  create(context) {
    const config = runtimeConfigObject(context.config, "local HyperFrames");
    runtimeConfigExact(config, [
      "nodePath", "hyperframesCliPath", "ffprobePath", "workers", "quality", "browserGpu",
      "defaultConcurrency", "processTimeoutMs", "maxProcessOutputBytes", "maxRenderedBytes",
    ], "local HyperFrames");
    const workers = config.workers;
    if (workers !== undefined && workers !== "auto") runtimeConfigPositiveInteger(workers, "HyperFrames workers");
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
    return createLocalHyperframesProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(nodePath === undefined ? {} : { nodePath }),
      ...(hyperframesCliPath === undefined ? {} : { hyperframesCliPath }),
      ...(ffprobePath === undefined ? {} : { ffprobePath }),
      ...(workers === undefined ? {} : { workers: workers as HyperframesWorkers }),
      ...(quality === undefined ? {} : { quality: quality as HyperframesQuality }),
      ...(browserGpu === undefined ? {} : { browserGpu: browserGpu as HyperframesBrowserGpu }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "HyperFrames defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(runtimeConfigPositiveInteger(config.processTimeoutMs, "HyperFrames processTimeoutMs") === undefined
        ? {} : { processTimeoutMs: config.processTimeoutMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxProcessOutputBytes, "HyperFrames maxProcessOutputBytes") === undefined
        ? {} : { maxProcessOutputBytes: config.maxProcessOutputBytes as number }),
      ...(runtimeConfigPositiveInteger(config.maxRenderedBytes, "HyperFrames maxRenderedBytes") === undefined
        ? {} : { maxRenderedBytes: config.maxRenderedBytes as number }),
    });
  },
  async doctor(context) {
    const config = runtimeConfigObject(context.config, "local HyperFrames");
    return [
      ...await diagnoseRuntimeExecutable({
        root: context.root,
        configured: runtimeConfigString(config.nodePath, "HyperFrames nodePath"),
        fallback: process.execPath,
        subject: "Node.js",
      }),
      ...await diagnoseRuntimeExecutable({
        root: context.root,
        configured: runtimeConfigString(config.ffprobePath, "HyperFrames ffprobePath"),
        fallback: "ffprobe",
        subject: "FFprobe",
      }),
    ];
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/provider-hyperframes-local",
  hostFacets: [localHyperframesRuntimeAdapter],
};

export default svmlPackage;
