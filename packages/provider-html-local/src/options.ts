export type HtmlWorkers = number | "auto";
export type HtmlBrowserGpu = "auto" | "software" | "hardware";
export type { HtmlRenderer } from "./electron.js";

export type HtmlExecutionOptions = import("./browser.js").BrowserOptions & import("./electron.js").ElectronOptions & {
  readonly ffprobePath?: string;
  /** Selected FFmpeg command for portable source extraction/encoding and GPU H.264 muxing. */
  readonly ffmpegPath?: string;
  /** Parallel Chrome workers inside one render. This is separate from Provider request concurrency. */
  readonly workers?: HtmlWorkers;
  /** Upper bound for auto's browser reservation; explicit workers remain fixed. */
  readonly maxWorkers?: number;
  /** Browser compositor policy. Electron shared textures require auto or hardware. */
  readonly browserGpu?: HtmlBrowserGpu;
  readonly processTimeoutMs?: number;
  readonly initializationTimeoutMs?: number;
  readonly frameTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  /** Artifact staging lifecycles in flight inside one render. */
  readonly artifactStagingConcurrency?: number;
  /** Bytes of completed PNGs or GPU frames retained while output waits for its next frame. */
  readonly maxPendingFrameBytes?: number;
  /** Bytes of decoded source pictures resident in one render's reusable working set. */
  readonly maxDecodedSourceBytes?: number;
  readonly maxRenderedBytes?: number;
};
