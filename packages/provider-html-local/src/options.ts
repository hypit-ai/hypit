export type HtmlWorkers = number | "auto";
export type HtmlQuality = "draft" | "standard" | "high";
export type HtmlBrowserGpu = "auto" | "software" | "hardware";

export type HtmlExecutionOptions = import("./browser.js").BrowserOptions & import("./electron.js").ElectronOptions & {
  readonly ffprobePath?: string;
  /** FFmpeg command for source extraction, PNG video encoding and GPU stream muxing. */
  readonly ffmpegPath?: string;
  /** Parallel capture workers inside one render, separate from Provider request concurrency. */
  readonly workers?: HtmlWorkers;
  /** Upper bound for auto's browser reservation; explicit workers remain fixed. */
  readonly maxWorkers?: number;
  readonly quality?: HtmlQuality;
  /** Browser rasterizer, default hardware. Use software for PNG capture without a usable GPU. */
  readonly browserGpu?: HtmlBrowserGpu;
  readonly processTimeoutMs?: number;
  readonly initializationTimeoutMs?: number;
  readonly frameTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  /** Artifact staging lifecycles in flight inside one render. */
  readonly artifactStagingConcurrency?: number;
  /** Admission budget for pending PNGs, or GPU snapshots and compressed output. */
  readonly maxPendingFrameBytes?: number;
  /** Retained decoded source samples across the render's workers. */
  readonly maxDecodedSourceBytes?: number;
  readonly maxRenderedBytes?: number;
};
