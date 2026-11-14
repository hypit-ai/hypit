import {
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import type { ExecutionEnvironmentAdapterFactoryContext } from "@hypit/execution-environment-local/extension";
import { resolveEnvironmentExecutable } from "@hypit/execution-environment-local/node";
import type { HtmlBrowserGpu, HtmlWorkers } from "@hypit/html-render-local";

const executionKeys = [
  "ffprobePath", "ffmpegPath", "workers", "maxWorkers", "browserGpu",
  "defaultConcurrency", "browserCapacity", "initializationTimeoutMs", "frameTimeoutMs",
  "processTimeoutMs", "maxProcessOutputBytes", "artifactStagingConcurrency",
  "maxPendingFrameBytes", "maxDecodedSourceBytes", "maxRenderedBytes",
] as const;

/** Parse deployment policy shared by local HTML Endpoint implementations. */
export function localHtmlRuntimeConfig(context: ExecutionEnvironmentAdapterFactoryContext, label: string,
  endpointKeys: readonly string[]) {
  const config = executionEnvironmentConfigObject(context.config, label);
  executionEnvironmentConfigExact(config, [...endpointKeys, ...executionKeys], label);
  const workers = config.workers;
  if (workers !== undefined && workers !== "auto") executionEnvironmentConfigPositiveInteger(workers, "HTML renderer workers");
  const browserGpu = executionEnvironmentConfigString(config.browserGpu, "HTML renderer browserGpu");
  if (browserGpu !== undefined && browserGpu !== "auto" && browserGpu !== "software" && browserGpu !== "hardware") {
    throw new Error("HTML renderer browserGpu is invalid");
  }
  const configuredFfprobe = executionEnvironmentConfigString(config.ffprobePath, "HTML renderer ffprobePath");
  const configuredFfmpeg = executionEnvironmentConfigString(config.ffmpegPath, "HTML renderer ffmpegPath");
  const ffmpegPath = resolveEnvironmentExecutable(context.dataRoot, configuredFfmpeg ?? "ffmpeg");
  const ffprobePath = resolveEnvironmentExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
  const optionalPositive = (key: string, subject: string) => executionEnvironmentConfigPositiveInteger(config[key], subject);
  const value = (key: string, subject: string) => {
    const parsed = optionalPositive(key, subject);
    return parsed === undefined ? {} : { [key]: parsed };
  };
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
}
