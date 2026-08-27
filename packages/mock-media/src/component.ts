import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { CanvasSpace } from "@hypit/spatial";
import type { ProgramClock } from "@hypit/program-space";
import type { SpeechDuration } from "@hypit/speech";
import { assertProgramClockIdentity } from "@hypit/program-space";
import { assertSpeechDurationIdentity } from "@hypit/speech";
import { mockMediaProducers } from "./manifest.js";

function inline<T>(value: StoredValue, subject: string): T {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

function canvas(value: StoredValue): CanvasSpace {
  const item = inline<CanvasSpace>(value, "Mock Canvas");
  if (!Number.isSafeInteger(item.widthPx) || item.widthPx <= 0 || !Number.isSafeInteger(item.heightPx) || item.heightPx <= 0) {
    throw new Error("Mock Canvas dimensions are invalid");
  }
  return item;
}

function color(): string { return "#9AA0A6"; }

export const mockMediaComponent = {
  producers: [
    {
      producer: mockMediaProducers.image,
      handler: ({ inputs }: { readonly inputs: Readonly<Record<string, { readonly value: StoredValue }>> }) => {
        const size = canvas(inputs.canvas!.value);
        return { outputs: {}, needs: { image: canonicalize({ width: size.widthPx, height: size.heightPx, color: color() }) } };
      },
    },
    {
      producer: mockMediaProducers.video,
      handler: ({ inputs }: { readonly inputs: Readonly<Record<string, { readonly value: StoredValue }>> }) => {
        const size = canvas(inputs.canvas!.value);
        const duration = inline<SpeechDuration>(inputs.duration!.value, "Mock video duration");
        const clock = inline<ProgramClock>(inputs.clock!.value, "Mock video clock");
        assertSpeechDurationIdentity(duration); assertProgramClockIdentity(clock);
        const frameCount = Math.max(1, Math.round(duration * clock.frameRate.numerator / clock.frameRate.denominator));
        return { outputs: {}, needs: { video: canonicalize({ width: size.widthPx, height: size.heightPx,
          frameRate: clock.frameRate, frameCount, color: color(), audio: "silence" }) } };
      },
    },
    {
      producer: mockMediaProducers.silence,
      handler: ({ inputs }: { readonly inputs: Readonly<Record<string, { readonly value: StoredValue }>> }) => {
        const duration = inline<SpeechDuration>(inputs.duration!.value, "Mock silence duration");
        assertSpeechDurationIdentity(duration);
        return { outputs: {}, needs: { audio: canonicalize({ sampleRate: 48_000, channels: 2,
          sampleFrames: Math.max(1, Math.round(duration * 48_000)) }) } };
      },
    },
  ],
};
