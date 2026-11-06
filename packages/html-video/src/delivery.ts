import { mediaDeliveryProfile } from "@hypit/media";
import {
  sameVisualDeliverySpec,
  verifyMediaDeliverySpec,
  verifyTimelineAudio,
  verifyTimelineVisual,
} from "@hypit/media";
import type {
  MediaDeliverySpec,
  MuxedMedia,
  TimelineAudio,
  TimelineVisual,
  VisualDeliverySpec,
} from "@hypit/media";
import { audioProgramSampleFrames, verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram, RenderAudioNeed } from "@hypit/audio-program";
import { verifyHtmlRasterRequest } from "@hypit/html-program";
import type { HtmlProgram, HtmlRasterRequest } from "@hypit/html-program";
import { createMuxMediaNeed, verifyMuxedMediaForNeed } from "@hypit/media-delivery";
import type { MuxMediaNeed } from "@hypit/media-delivery";
import { frameSpanSamples } from "@hypit/temporal";

export type HtmlVideoDeliveryPlan = {
  readonly visual: HtmlRasterRequest;
  readonly audio: RenderAudioNeed;
  readonly delivery: MediaDeliverySpec;
};

/** Execution remains injectable: this contract names products, not Providers or file paths. */
export type HtmlVideoDeliveryExecutor = {
  readonly renderVisual: (request: HtmlRasterRequest) => Promise<TimelineVisual>;
  readonly renderAudio: (request: RenderAudioNeed) => Promise<TimelineAudio>;
  readonly mux: (request: MuxMediaNeed) => Promise<MuxedMedia>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Explicit standard delivery selected by the HTML Video author declaration. */
export function htmlVideoDeliverySpec(
  quality: VisualDeliverySpec["encoding"]["quality"] = "standard",
): MediaDeliverySpec {
  return mediaDeliveryProfile("bt709-h264", { quality });
}

export function verifyHtmlVideoDeliveryPlan(value: unknown): asserts value is HtmlVideoDeliveryPlan {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "HTML Video delivery plan must be an object.");
  const plan = value as HtmlVideoDeliveryPlan;
  assert(Object.keys(plan).sort().join("\u0000") === "audio\u0000delivery\u0000visual",
    "HTML Video delivery plan has invalid fields.");
  verifyHtmlRasterRequest(plan.visual);
  verifyAudioProgram(plan.audio.program);
  assert(plan.audio.range === undefined, "HTML Video full delivery plan cannot contain an Audio range.");
  verifyMediaDeliverySpec(plan.delivery);
  assert(sameVisualDeliverySpec(plan.visual.delivery, plan.delivery.visual),
    "HTML Video visual request implements another delivery requirement.");
  assert(plan.audio.program.sampling.sampleRate === plan.delivery.audio.sampleRate,
    "HTML Video AudioProgram uses another delivery sample rate.");
  const expected = frameSpanSamples(
    { startFrame: 0, endFrameExclusive: plan.visual.program.frameCount },
    { frameRate: plan.visual.program.frameRate },
    plan.delivery.audio.sampleRate,
  ).sampleFrames;
  assert(audioProgramSampleFrames(plan.audio.program) === expected,
    "HTML Video picture and audio programmes have different presentation durations.");
}

/** Assemble terminal programmes into provider-independent render requests. */
export function createHtmlVideoDeliveryPlan(
  visual: HtmlProgram,
  audio: AudioProgram,
  delivery: MediaDeliverySpec,
): HtmlVideoDeliveryPlan {
  const plan: HtmlVideoDeliveryPlan = {
    visual: { program: structuredClone(visual), delivery: structuredClone(delivery.visual) },
    audio: { program: structuredClone(audio) },
    delivery: structuredClone(delivery),
  };
  verifyHtmlVideoDeliveryPlan(plan);
  return structuredClone(plan);
}

/** Execute independent terminals in parallel, then close their exact products through mux. */
export async function executeHtmlVideoDeliveryPlan(
  plan: HtmlVideoDeliveryPlan,
  executor: HtmlVideoDeliveryExecutor,
): Promise<MuxedMedia> {
  verifyHtmlVideoDeliveryPlan(plan);
  const [visual, audio] = await Promise.all([
    executor.renderVisual(structuredClone(plan.visual)),
    executor.renderAudio(structuredClone(plan.audio)),
  ]);
  verifyTimelineVisual(visual);
  verifyTimelineAudio(audio);
  const request = createMuxMediaNeed(visual, audio, plan.delivery);
  const media = await executor.mux(request);
  verifyMuxedMediaForNeed(media, request);
  return structuredClone(media);
}
