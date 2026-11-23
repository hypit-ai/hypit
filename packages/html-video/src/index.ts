import type { AudioProgram } from "@hypit/audio-program";
import type { HtmlFrameRequest, HtmlRasterRequest } from "@hypit/html-program";
import type { MediaResource } from "@hypit/media";
import type { TemporalRange } from "@hypit/temporal/algebra";

export type HtmlVideoDeliveryProfile = {
  readonly picture: {
    readonly width: number;
    readonly height: number;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly background: string;
    readonly quality: "draft" | "standard" | "high";
    readonly renderer?: "chromium" | "electron";
  };
  readonly audio?: { readonly sampleRate: number; readonly channels: 1 | 2 };
};

export type HtmlVideoDeliveryPlan = {
  readonly visual: HtmlRasterRequest;
  readonly audio?: AudioProgram;
  readonly range?: TemporalRange;
};

export interface HtmlFrameExecutor {
  capture(request: HtmlFrameRequest, signal?: AbortSignal): Promise<Uint8Array>;
  captureFrames?(request: HtmlFrameRequest, signal?: AbortSignal): Promise<readonly Uint8Array[]>;
  openCapture?(request: Pick<HtmlRasterRequest, "program" | "picture">, signal?: AbortSignal): Promise<HtmlFrameCapture>;
  openSourceFrames?(program: HtmlFrameRequest["program"], signal: AbortSignal): Promise<HtmlSourceFrames>;
}

export interface HtmlFrameCapture {
  captureFrames(frames: readonly number[], signal?: AbortSignal): Promise<readonly Uint8Array[]>;
  close(): Promise<void>;
}

export interface HtmlSourceFrames {
  read(source: string, frame: number, signal?: AbortSignal): Promise<Uint8Array>;
  close(): Promise<void>;
}

export type HtmlVideoRenderer = "chromium" | "electron";

export type HtmlVideoExecutionProgress = {
  readonly phase: "visual" | "audio" | "mux";
  readonly completed: number;
  readonly total: number;
};

export type HtmlVideoExecutionOptions = {
  readonly destination: string;
  readonly renderer: HtmlVideoRenderer;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: HtmlVideoExecutionProgress) => void;
};

export interface HtmlVideoExecutor {
  execute(plan: HtmlVideoDeliveryPlan, options: HtmlVideoExecutionOptions): Promise<MediaResource>;
}
