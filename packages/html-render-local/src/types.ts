import type { HtmlFrameRequest, HtmlRasterRequest, RenderedVisual } from "@hypit/html-program";

export type HtmlRenderProgress = {
  readonly completedFrames: number;
  readonly totalFrames: number;
};

export type LocalHtmlRenderOptions = {
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly workers?: number | "auto";
  readonly maxWorkers?: number;
  readonly maxPendingFrameBytes?: number;
  readonly maxDecodedSourceBytes?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: HtmlRenderProgress) => void;
};

export type StagedHtmlFiles = {
  readonly directory: string;
  readonly document: string;
  /** Absolute staged path keyed by the closed invocation-local resource address. */
  readonly artifactPaths: ReadonlyMap<string, string>;
};

export type StagedHtmlProgram = StagedHtmlFiles & {
  readonly url: string;
};

export type HtmlFrameCaptureWorker = {
  readonly capture: (frame: number, transparent: boolean) => Promise<Uint8Array>;
  readonly close: () => Promise<void>;
};

type HtmlCaptureBackendBase = { readonly id: string };

export type HtmlCaptureBackend = HtmlCaptureBackendBase & ({
  readonly mode: "frame-buffer";
  createWorker(
    request: HtmlRasterRequest | HtmlFrameRequest,
    staged: StagedHtmlProgram,
    options: LocalHtmlRenderOptions,
  ): Promise<HtmlFrameCaptureWorker>;
} | {
  readonly mode: "encoded-stream";
  readonly id: string;
  renderVisual(
    request: HtmlRasterRequest,
    staged: StagedHtmlProgram,
    destination: string,
    options: Required<Pick<LocalHtmlRenderOptions, "ffmpegPath">> & LocalHtmlRenderOptions,
  ): Promise<RenderedVisual>;
});
