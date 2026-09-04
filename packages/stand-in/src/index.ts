import type { ComponentPackage } from "@hypit/component-kit";
import type { MediaRational } from "@hypit/media";
import { assertProgramClockIdentity } from "@hypit/program-space";
import type { ProgramClock } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue, StoredValue } from "@hypit/protocol";
import { assertCanvasSpace } from "@hypit/spatial";
import type { CanvasSpace } from "@hypit/spatial";
import { assertSpeechDurationIdentity } from "@hypit/speech";
import type { SpeechDuration } from "@hypit/speech";

import { standInProducers, standInTypes } from "./manifest.js";

export {
  standInCapabilities,
  standInDependency,
  standInManifest,
  standInModuleRef,
  standInProducers,
  standInTypes,
} from "./manifest.js";
export { standInImageFragment, standInSilenceFragment, standInVideoFragment } from "./fragment.js";

/**
 * The minimum visible shape of a generic stand-in. It says nothing about the
 * Producer or model whose output a Run may choose to replace with it.
 */
export type StandInCardRequest = {
  readonly kind: "image" | "video";
  /** Even, positive pixel dimensions of the card, the frame the real output would have. */
  readonly width: number;
  readonly height: number;
  /** A video card runs for exactly this many frames at this clock and carries a running timecode. */
  readonly video?: {
    readonly frameRate: MediaRational;
    readonly frameCount: number;
    /** The model would have generated sound, so the card carries a silent 48 kHz stereo track. */
    readonly audio?: "silence";
  };
};

export type StandInSilenceRequest = {
  readonly sampleRate: 48_000;
  readonly channels: 2;
  readonly sampleFrames: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function evenPositive(value: unknown, subject: string): number {
  assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value % 2 === 0,
    `${subject} must be a positive even integer`);
  return value;
}

export function verifyStandInCardRequest(value: unknown): asserts value is StandInCardRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "StandInCardRequest must be an object");
  const item = value as Record<string, unknown>;
  assert(item.kind === "image" || item.kind === "video", "StandInCardRequest kind must be image or video");
  evenPositive(item.width, "StandInCardRequest width");
  evenPositive(item.height, "StandInCardRequest height");
  if (item.kind === "video") {
    const video = item.video as Record<string, unknown> | undefined;
    assert(video !== undefined && typeof video === "object", "a video StandInCardRequest needs its frame domain");
    const rate = video.frameRate as Record<string, unknown> | undefined;
    assert(rate !== undefined && Number.isSafeInteger(rate.numerator) && (rate.numerator as number) > 0
      && Number.isSafeInteger(rate.denominator) && (rate.denominator as number) > 0,
    "StandInCardRequest frameRate must be a positive rational");
    assert(Number.isSafeInteger(video.frameCount) && (video.frameCount as number) > 0,
      "StandInCardRequest frameCount must be a positive integer");
    assert(video.audio === undefined || video.audio === "silence", "StandInCardRequest audio can only be silence");
  } else {
    assert(item.video === undefined, "an image StandInCardRequest has no frame domain");
  }
}

export function verifyStandInSilenceRequest(value: unknown): asserts value is StandInSilenceRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "StandInSilenceRequest must be an object");
  const item = value as Record<string, unknown>;
  assert(item.sampleRate === 48_000 && item.channels === 2, "StandInSilenceRequest must be 48 kHz stereo");
  assert(Number.isSafeInteger(item.sampleFrames) && (item.sampleFrames as number) > 0,
    "StandInSilenceRequest sampleFrames must be a positive integer");
}

export function sealStandInCardRequest(value: StandInCardRequest): StandInCardRequest {
  verifyStandInCardRequest(value);
  return canonicalize(value as unknown as CanonicalValue) as unknown as StandInCardRequest;
}

function inline(value: StoredValue, subject: string): unknown {
  assert(value.kind === "inline", `${subject} must be inline`);
  return value.value;
}

function typedInline<T>(value: StoredValue, subject: string): T {
  return inline(value, subject) as T;
}

function exactFrameCount(duration: SpeechDuration, clock: ProgramClock): number {
  const frames = duration * clock.frameRate.numerator / clock.frameRate.denominator;
  const rounded = Math.round(frames);
  assert(Number.isSafeInteger(rounded) && rounded > 0 && Math.abs(frames - rounded) < 1e-7,
    "Stand-in video duration must end on a whole ProgramClock frame");
  return rounded;
}

export const standInComponent = {
  validators: [
    {
      type: standInTypes.cardRequest,
      handler: ({ value }) => { verifyStandInCardRequest(inline(value, "StandInCardRequest")); },
    },
    {
      type: standInTypes.silenceRequest,
      handler: ({ value }) => { verifyStandInSilenceRequest(inline(value, "StandInSilenceRequest")); },
    },
  ],
  producers: [
    {
      producer: standInProducers.image,
      handler: ({ inputs }) => {
        const canvas = typedInline<CanvasSpace>(inputs.canvas!.value, "stand-in image Canvas");
        assertCanvasSpace(canvas);
        return { outputs: {}, needs: { image: canonicalize(sealStandInCardRequest({
          kind: "image", width: canvas.widthPx, height: canvas.heightPx,
        })) } };
      },
    },
    {
      producer: standInProducers.video,
      handler: ({ inputs }) => {
        const canvas = typedInline<CanvasSpace>(inputs.canvas!.value, "stand-in video Canvas");
        const duration = typedInline<SpeechDuration>(inputs.duration!.value, "stand-in video duration");
        const clock = typedInline<ProgramClock>(inputs.clock!.value, "stand-in video clock");
        assertCanvasSpace(canvas);
        assertSpeechDurationIdentity(duration);
        assertProgramClockIdentity(clock);
        return { outputs: {}, needs: { video: canonicalize(sealStandInCardRequest({
          kind: "video",
          width: canvas.widthPx,
          height: canvas.heightPx,
          video: { frameRate: clock.frameRate, frameCount: exactFrameCount(duration, clock), audio: "silence" },
        })) } };
      },
    },
    {
      producer: standInProducers.silence,
      handler: ({ inputs }) => {
        const duration = typedInline<SpeechDuration>(inputs.duration!.value, "stand-in silence duration");
        assertSpeechDurationIdentity(duration);
        const sampleFrames = Math.round(duration * 48_000);
        const request: StandInSilenceRequest = { sampleRate: 48_000, channels: 2, sampleFrames };
        verifyStandInSilenceRequest(request);
        return { outputs: {}, needs: { audio: canonicalize(request) } };
      },
    },
  ],
} satisfies ComponentPackage;
