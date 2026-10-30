import {
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-local/extension";
import type { RuntimeAdapterFactoryContext } from "@hypit/runtime-local/extension";
import { resolveRuntimeExecutable } from "@hypit/runtime-local/node";

import type { HtmlBrowserGpu, HtmlWorkers } from "./options.js";

const executionKeys = [
  "ffprobePath", "ffmpegPath", "workers", "maxWorkers", "browserGpu",
  "defaultConcurrency", "browserCapacity", "initializationTimeoutMs", "frameTimeoutMs",
  "processTimeoutMs", "maxProcessOutputBytes", "artifactStagingConcurrency",
  "maxPendingFrameBytes", "maxDecodedSourceBytes", "maxRenderedBytes",
] as const;

/** Parse the limits shared by local HTML Endpoint implementations. */
export function localHtmlRuntimeConfig(context: RuntimeAdapterFactoryContext, label: string,
  endpointKeys: readonly string[]) {
  const config = runtimeConfigObject(context.config, label);
  runtimeConfigExact(config, [...endpointKeys, ...executionKeys], label);
  const workers = config.workers;
  if (workers !== undefined && workers !== "auto") runtimeConfigPositiveInteger(workers, "HTML renderer workers");
  const browserGpu = runtimeConfigString(config.browserGpu, "HTML renderer browserGpu");
  if (browserGpu !== undefined && browserGpu !== "auto" && browserGpu !== "software" && browserGpu !== "hardware") {
    throw new Error("HTML renderer browserGpu is invalid");
  }
  const configuredFfprobe = runtimeConfigString(config.ffprobePath, "HTML renderer ffprobePath");
  const configuredFfmpeg = runtimeConfigString(config.ffmpegPath, "HTML renderer ffmpegPath");
  const ffmpegPath = resolveRuntimeExecutable(context.dataRoot, configuredFfmpeg ?? "ffmpeg");
  const ffprobePath = resolveRuntimeExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
  const optionalPositive = (key: string, label: string) => runtimeConfigPositiveInteger(config[key], label);
  const shared = {
    instance: context.instance,
    ...(context.pool === undefined ? {} : { pool: context.pool }),
    ffprobePath,
    ffmpegPath,
    ...(workers === undefined ? {} : { workers: workers as HtmlWorkers }),
    ...(browserGpu === undefined ? {} : { browserGpu: browserGpu as HtmlBrowserGpu }),
    ...value("defaultConcurrency", "HTML renderer defaultConcurrency"),
    ...value("maxWorkers", "HTML renderer maxWorkers"),
    ...value("browserCapacity", "HTML renderer browserCapacity"),
    ...value("initializationTimeoutMs", "HTML renderer initializationTimeoutMs"),
    ...value("frameTimeoutMs", "HTML renderer frameTimeoutMs"),
    ...value("processTimeoutMs", "HTML renderer processTimeoutMs"),
    ...value("maxProcessOutputBytes", "HTML renderer maxProcessOutputBytes"),
    ...value("artifactStagingConcurrency", "HTML renderer artifactStagingConcurrency"),
    ...value("maxPendingFrameBytes", "HTML renderer maxPendingFrameBytes"),
    ...value("maxDecodedSourceBytes", "HTML renderer maxDecodedSourceBytes"),
    ...value("maxRenderedBytes", "HTML renderer maxRenderedBytes"),
  };
  return { config, configuredFfprobe, configuredFfmpeg, ffmpegPath, ffprobePath, shared };

  function value(key: string, label: string) {
    const parsed = optionalPositive(key, label);
    return parsed === undefined ? {} : { [key]: parsed };
  }
}
