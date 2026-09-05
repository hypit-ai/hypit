export type HyperframesWorkers = number | "auto";
export type HyperframesQuality = "draft" | "standard" | "high";
export type HyperframesBrowserGpu = "auto" | "software" | "hardware";

export type HyperframesExecutionOptions = {
  readonly ffprobePath?: string;
  /** Final H.264 encoder. Source extraction uses the pinned engine's binary resolver. */
  readonly ffmpegPath?: string;
  /** Parallel Chrome workers inside one render. This is separate from Provider request concurrency. */
  readonly workers?: HyperframesWorkers;
  readonly quality?: HyperframesQuality;
  /** Chrome's rasterizer, default hardware. Use software without a usable GPU. */
  readonly browserGpu?: HyperframesBrowserGpu;
  readonly processTimeoutMs?: number;
  readonly initializationTimeoutMs?: number;
  readonly frameTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  readonly maxRenderedBytes?: number;
};
