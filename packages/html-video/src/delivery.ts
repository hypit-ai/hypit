import { mediaDeliveryProfile } from "@hypit/media";
import {
  sameVisualDeliverySpec,
  verifyMediaDeliverySpec,
  verifyRenderedAudio,
  verifyRenderedVisual,
} from "@hypit/media";
import type {
  MediaDeliverySpec,
  MuxedMedia,
  RenderedAudio,
  RenderedVisual,
  VisualDeliverySpec,
} from "@hypit/media";
import { audioProgramSampleFrames, verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram, RenderAudioNeed } from "@hypit/audio-program";
import { verifyHtmlRasterRequest } from "@hypit/html-program";
import type { HtmlProgram, HtmlRasterRequest } from "@hypit/html-program";
import { createMuxMediaNeed, verifyMuxedMediaForNeed } from "@hypit/media-delivery";
import type { MuxMediaNeed } from "@hypit/media-delivery";
import { exactTemporalValueFromFrames, frameSpanSamples, resolveTemporalBoundary } from "@hypit/temporal";
import type { FrameSpan, TemporalRange } from "@hypit/temporal";
import { compareExactTemporalValues, exactTemporalZero } from "@hypit/temporal/algebra";

export type HtmlVideoDeliveryPlan = {
  readonly visual: HtmlRasterRequest;
  readonly audio: RenderAudioNeed;
  readonly delivery: MediaDeliverySpec;
};

/** Execution remains injectable: this contract names products, not Providers or file paths. */
export type HtmlVideoDeliveryExecutor = {
  readonly renderVisual: (request: HtmlRasterRequest) => Promise<RenderedVisual>;
  readonly renderAudio: (request: RenderAudioNeed) => Promise<RenderedAudio>;
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
  verifyMediaDeliverySpec(plan.delivery);
  assert(sameVisualDeliverySpec(plan.visual.delivery, plan.delivery.visual),
    "HTML Video visual request implements another delivery requirement.");
  assert(plan.audio.program.sampling.sampleRate === plan.delivery.audio.sampleRate,
    "HTML Video AudioProgram uses another delivery sample rate.");
  const visualSpan = plan.visual.range ?? {
    startFrame: 0,
    endFrameExclusive: plan.visual.program.frameCount,
  };
  const expected = frameSpanSamples(
    visualSpan,
    { frameRate: plan.visual.program.frameRate },
    plan.delivery.audio.sampleRate,
  ).sampleFrames;
  let audioFrames = audioProgramSampleFrames(plan.audio.program);
  if (plan.audio.range !== undefined) {
    assert(compareExactTemporalValues(plan.audio.range.start, exactTemporalZero()) >= 0
      && compareExactTemporalValues(plan.audio.range.start, plan.audio.range.end) < 0
      && compareExactTemporalValues(plan.audio.range.end, plan.audio.program.domain.duration) <= 0,
    "HTML Video Audio selection lies outside its Programme.");
    const sampleGrid = {
      frameRate: { numerator: plan.audio.program.sampling.sampleRate, denominator: 1 },
    };
    audioFrames = resolveTemporalBoundary(plan.audio.range.end, sampleGrid, "nearest")
      - resolveTemporalBoundary(plan.audio.range.start, sampleGrid, "nearest");
  }
  assert(audioFrames === expected,
    "HTML Video selected picture and audio have different presentation durations.");
  if (plan.visual.range !== undefined) {
    assert(plan.audio.range !== undefined,
      "HTML Video focused Picture delivery must select the matching Audio range.");
    const grid = { frameRate: plan.visual.program.frameRate };
    const start = exactTemporalValueFromFrames(plan.visual.range.startFrame, grid);
    const end = exactTemporalValueFromFrames(plan.visual.range.endFrameExclusive, grid);
    assert(compareExactTemporalValues(plan.audio.range.start, start) === 0
      && compareExactTemporalValues(plan.audio.range.end, end) === 0,
    "HTML Video Picture and Audio selections describe different intervals.");
  }
}

/** Assemble terminal programmes into provider-independent full or focused render requests. */
export function createHtmlVideoDeliveryPlan(
  visual: HtmlProgram,
  audio: AudioProgram,
  delivery: MediaDeliverySpec,
  options: { readonly range?: FrameSpan; readonly audioRange?: TemporalRange } = {},
): HtmlVideoDeliveryPlan {
  assert(options.range === undefined || options.audioRange === undefined,
    "HTML Video delivery selects either a shared frame range or an already-focused Picture Programme.");
  const range = options.range === undefined ? undefined : structuredClone(options.range);
  const audioRange = options.audioRange === undefined
    ? range === undefined ? undefined : {
      start: exactTemporalValueFromFrames(range.startFrame, { frameRate: visual.frameRate }),
      end: exactTemporalValueFromFrames(range.endFrameExclusive, { frameRate: visual.frameRate }),
    }
    : structuredClone(options.audioRange);
  const plan: HtmlVideoDeliveryPlan = {
    visual: {
      program: structuredClone(visual),
      delivery: structuredClone(delivery.visual),
      ...(range === undefined ? {} : { range }),
    },
    audio: {
      program: structuredClone(audio),
      ...(audioRange === undefined ? {} : { range: audioRange }),
    },
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
  verifyRenderedVisual(visual);
  verifyRenderedAudio(audio);
  const request = createMuxMediaNeed(visual, audio, plan.delivery);
  const media = await executor.mux(request);
  verifyMuxedMediaForNeed(media, request);
  return structuredClone(media);
}
