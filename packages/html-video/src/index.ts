import type { AudioProgram } from "@hypit/audio-program";
import type { AudiovisualProgram } from "@hypit/audiovisual";
import {
  lowerAudiovisualAudioProgram,
  type AudiovisualAudioContribution,
} from "@hypit/audiovisual-audio";
import {
  lowerAudiovisualPictureToHtmlProgram,
  type AudiovisualHtmlLink,
  type AudiovisualHtmlOutput,
} from "@hypit/audiovisual-html";
import type { HtmlFrameRequest, HtmlRasterRequest } from "@hypit/html-program";
import type { MediaResource } from "@hypit/media";

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
  readonly range?: AudiovisualHtmlOutput["range"];
};

export type HtmlVideoTerminalLink = {
  readonly program: AudiovisualProgram;
  readonly picture: AudiovisualHtmlLink;
  readonly audioContributions: readonly AudiovisualAudioContribution[];
};

export function createHtmlVideoDeliveryPlan(
  link: HtmlVideoTerminalLink,
  profile: HtmlVideoDeliveryProfile,
  range?: AudiovisualHtmlOutput["range"],
): HtmlVideoDeliveryPlan {
  const visual = lowerAudiovisualPictureToHtmlProgram(link.picture, {
    frameRate: profile.picture.frameRate,
    canvas: { width: profile.picture.width, height: profile.picture.height, background: profile.picture.background },
    ...(range === undefined ? {} : { range }),
  });
  const audio = link.program.audio === undefined ? undefined : lowerAudiovisualAudioProgram({
    program: link.program,
    contributions: link.audioContributions,
    sampleRate: profile.audio?.sampleRate ?? 48_000,
    channels: profile.audio?.channels ?? 2,
  });
  return {
    visual: { program: visual, picture: { alpha: "opaque", matte: profile.picture.background }, quality: profile.picture.quality },
    ...(audio === undefined ? {} : { audio }),
    ...(range === undefined ? {} : { range }),
  };
}

export function createHtmlPreviewFrame(
  link: HtmlVideoTerminalLink,
  output: AudiovisualHtmlOutput & { readonly range: NonNullable<AudiovisualHtmlOutput["range"]> },
): HtmlFrameRequest {
  return {
    program: lowerAudiovisualPictureToHtmlProgram(link.picture, output),
    frames: [0],
    picture: { alpha: "opaque", matte: output.canvas.background },
  };
}

export interface HtmlFrameExecutor {
  capture(request: HtmlFrameRequest, signal?: AbortSignal): Promise<Uint8Array>;
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
