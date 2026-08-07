import {
  assertCompositionIdentity,
  programSpaceFrameCount,
} from "@narratage/contracts";
import type { Composition, ProgramSpace } from "@narratage/contracts";
import { canonicalize, isDigest } from "@narratage/protocol";

import type { AudioProgramPlan } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sampleBoundary(frame: number, numerator: number, denominator: number): number {
  const scaled = BigInt(frame) * 48_000n * BigInt(denominator);
  const rate = BigInt(numerator);
  const rounded = (scaled * 2n + rate) / (rate * 2n);
  assert(rounded >= 0n && rounded <= BigInt(Number.MAX_SAFE_INTEGER), "Audio sample boundary is unsafe");
  return Number(rounded);
}

function samplesFromSeconds(seconds: number, subject: string): number {
  assert(Number.isFinite(seconds) && seconds >= 0, `${subject} is invalid`);
  const result = Math.round(seconds * 48_000);
  assert(Number.isSafeInteger(result), `${subject} exceeds safe sample arithmetic`);
  return result;
}

export function sealAudioProgramPlan(value: AudioProgramPlan): AudioProgramPlan {
  return canonicalize(value) as unknown as AudioProgramPlan;
}

export function verifyAudioProgramPlan(value: unknown): asserts value is AudioProgramPlan {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "AudioProgramPlan must be an object");
  const item = value as AudioProgramPlan;
  assert(item.contract === "svml.audio-program-plan@1", "AudioProgramPlan contract is invalid");
  assert(Number.isSafeInteger(item.frameRate?.numerator) && item.frameRate.numerator > 0
    && Number.isSafeInteger(item.frameRate?.denominator) && item.frameRate.denominator > 0,
  "AudioProgramPlan frame rate is invalid");
  assert(Number.isSafeInteger(item.frameCount) && item.frameCount > 0, "AudioProgramPlan frame count is invalid");
  assert(item.sampleRate === 48_000, "AudioProgramPlan sample rate must be 48000");
  assert(item.sampleFrames === sampleBoundary(item.frameCount, item.frameRate.numerator, item.frameRate.denominator),
    "AudioProgramPlan sample count differs from its frame domain");
  assert(Array.isArray(item.clips), "AudioProgramPlan clips are invalid");
  const ids = new Set<string>();
  for (const clip of item.clips) {
    assert(typeof clip.id === "string" && clip.id.length > 0 && !ids.has(clip.id),
      "AudioProgramPlan clip id is empty or repeated");
    ids.add(clip.id);
    assert(clip.artifact?.kind === "blob" && isDigest(clip.artifact.digest)
      && Number.isSafeInteger(clip.artifact.size) && clip.artifact.size >= 0
      && clip.artifact.mediaType === "audio/wav",
    `AudioProgramPlan clip ${clip.id} must reference canonical WAV`);
    assert(Number.isSafeInteger(clip.targetStartSample) && clip.targetStartSample >= 0
      && Number.isSafeInteger(clip.targetEndSampleExclusive)
      && clip.targetEndSampleExclusive > clip.targetStartSample
      && clip.targetEndSampleExclusive <= item.sampleFrames,
    `AudioProgramPlan clip ${clip.id} target interval is invalid`);
    assert(Number.isSafeInteger(clip.sourceStartSample) && clip.sourceStartSample >= 0,
      `AudioProgramPlan clip ${clip.id} source start is invalid`);
    assert(Number.isFinite(clip.playbackRate) && clip.playbackRate > 0 && clip.playbackRate <= 100,
      `AudioProgramPlan clip ${clip.id} playback rate is invalid`);
    assert(Number.isFinite(clip.gain) && clip.gain >= 0 && clip.gain <= 64,
      `AudioProgramPlan clip ${clip.id} gain is invalid`);
    const length = clip.targetEndSampleExclusive - clip.targetStartSample;
    assert(Number.isSafeInteger(clip.fadeInSamples) && clip.fadeInSamples >= 0 && clip.fadeInSamples <= length
      && Number.isSafeInteger(clip.fadeOutSamples) && clip.fadeOutSamples >= 0 && clip.fadeOutSamples <= length,
    `AudioProgramPlan clip ${clip.id} fade is invalid`);
    assert(clip.bus === "speech" || clip.bus === "music" || clip.bus === "sfx" || clip.bus === "source",
      `AudioProgramPlan clip ${clip.id} bus is invalid`);
  }
  assert(item.mix?.normalize === false && item.mix?.limiter === "none",
    "AudioProgramPlan cannot hide normalization or limiting");
}

export function compileAudioProgramPlan(composition: Composition, programSpace: ProgramSpace): AudioProgramPlan {
  assertCompositionIdentity(composition, programSpace);
  const frameCount = programSpaceFrameCount(programSpace);
  const { numerator, denominator } = programSpace.frameRate;
  const clips = composition.tracks
    .filter((track) => track.contract === "svml.audio-track@1")
    .flatMap((track) => track.clips.map((clip) => {
      if (clip.artifact.mediaType !== "audio/wav") {
        throw new Error(`Audio clip ${track.id}.${clip.id} must be normalized to canonical WAV before mixing`);
      }
      const targetStartSample = sampleBoundary(clip.span.startFrame, numerator, denominator);
      const targetEndSampleExclusive = sampleBoundary(clip.span.endFrameExclusive, numerator, denominator);
      return {
        id: `${track.id}:${clip.id}`,
        artifact: {
          kind: "blob" as const,
          digest: clip.artifact.digest,
          size: clip.artifact.size,
          mediaType: clip.artifact.mediaType,
        },
        targetStartSample,
        targetEndSampleExclusive,
        sourceStartSample: samplesFromSeconds(clip.mediaStartSec ?? 0, `${track.id}.${clip.id}.mediaStartSec`),
        playbackRate: clip.playbackRate ?? 1,
        gain: clip.gain ?? 1,
        fadeInSamples: samplesFromSeconds(clip.fadeInSec ?? 0, `${track.id}.${clip.id}.fadeInSec`),
        fadeOutSamples: samplesFromSeconds(clip.fadeOutSec ?? 0, `${track.id}.${clip.id}.fadeOutSec`),
        bus: clip.bus ?? "source" as const,
      };
    }));
  return sealAudioProgramPlan({
    contract: "svml.audio-program-plan@1",
    frameRate: { ...programSpace.frameRate },
    frameCount,
    sampleRate: 48_000,
    sampleFrames: sampleBoundary(frameCount, numerator, denominator),
    clips,
    mix: { normalize: false, limiter: "none" },
  });
}
