import { programFrameSampleBoundary, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { assertCompositionIdentity } from "@hypit/composition";
import type { Composition } from "@hypit/composition";
import { canonicalize, isDigest } from "@hypit/protocol";

import type { AudioProgramPlan } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function sealAudioProgramPlan(value: AudioProgramPlan): AudioProgramPlan {
  return canonicalize(value) as unknown as AudioProgramPlan;
}

export function verifyAudioProgramPlan(value: unknown): asserts value is AudioProgramPlan {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "AudioProgramPlan must be an object");
  const item = value as AudioProgramPlan;
  assert(Number.isSafeInteger(item.frameRate?.numerator) && item.frameRate.numerator > 0
    && Number.isSafeInteger(item.frameRate?.denominator) && item.frameRate.denominator > 0,
  "AudioProgramPlan frame rate is invalid");
  assert(Number.isSafeInteger(item.frameCount) && item.frameCount > 0, "AudioProgramPlan frame count is invalid");
  assert(item.sampleRate === 48_000, "AudioProgramPlan sample rate must be 48000");
  const planSpace = {
    id: "audio-program-plan",
    narrativeId: "audio-program-plan",
    durationSec: item.frameCount * item.frameRate.denominator / item.frameRate.numerator,
    frameRate: item.frameRate,
  };
  assert(item.sampleFrames === programFrameSampleBoundary(planSpace, item.frameCount, 48_000),
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
    assert(Number.isSafeInteger(clip.sourceSampleFrames) && clip.sourceSampleFrames > 0
      && Number.isSafeInteger(clip.sourceEndSampleExclusive)
      && clip.sourceEndSampleExclusive > clip.sourceStartSample
      && clip.sourceEndSampleExclusive <= clip.sourceSampleFrames,
    `AudioProgramPlan clip ${clip.id} source interval is invalid`);
    const sourceLength = clip.sourceEndSampleExclusive - clip.sourceStartSample;
    assert(typeof clip.sourceLoop === "boolean"
      && Number.isSafeInteger(clip.sourcePhaseSample) && clip.sourcePhaseSample >= 0
      && clip.sourcePhaseSample < sourceLength
      && (clip.sourceLoop || clip.sourcePhaseSample === 0),
    `AudioProgramPlan clip ${clip.id} loop phase is invalid`);
    assert(Number.isFinite(clip.playbackRate) && clip.playbackRate > 0 && clip.playbackRate <= 100,
      `AudioProgramPlan clip ${clip.id} playback rate is invalid`);
    assert(clip.pitch === "preserve", `AudioProgramPlan clip ${clip.id} pitch policy is invalid`);
    assert(Number.isFinite(clip.gain) && clip.gain >= 0 && clip.gain <= 64,
      `AudioProgramPlan clip ${clip.id} gain is invalid`);
    const length = clip.targetEndSampleExclusive - clip.targetStartSample;
    assert(Number.isSafeInteger(clip.fadeInSamples) && clip.fadeInSamples >= 0 && clip.fadeInSamples <= length
      && Number.isSafeInteger(clip.fadeOutSamples) && clip.fadeOutSamples >= 0 && clip.fadeOutSamples <= length,
    `AudioProgramPlan clip ${clip.id} fade is invalid`);
  }
  assert(item.mix?.normalize === false && item.mix?.limiter === "none",
    "AudioProgramPlan cannot hide normalization or limiting");
}

export function compileAudioProgramPlan(composition: Composition, programSpace: ProgramSpace): AudioProgramPlan {
  assertCompositionIdentity(composition, programSpace);
  const frameCount = programSpaceFrameCount(programSpace);
  const clips = composition.tracks
    .filter((track) => track.kind === "audio")
    .flatMap((track) => track.clips.map((clip) => {
      if (clip.artifact.mediaType !== "audio/wav") {
        throw new Error(`Audio clip ${track.id}.${clip.id} must be normalized to canonical WAV before mixing`);
      }
      return {
        id: `${track.id}:${clip.id}`,
        artifact: {
          kind: "blob" as const,
          digest: clip.artifact.digest,
          size: clip.artifact.size,
          mediaType: clip.artifact.mediaType,
        },
        targetStartSample: clip.target.startSample,
        targetEndSampleExclusive: clip.target.endSampleExclusive,
        sourceSampleFrames: clip.source.sampleFrames,
        sourceStartSample: clip.source.startSample,
        sourceEndSampleExclusive: clip.source.endSampleExclusive,
        sourceLoop: clip.source.loop,
        sourcePhaseSample: clip.source.phaseSample,
        playbackRate: clip.playbackRate,
        pitch: clip.pitch,
        gain: clip.gain,
        fadeInSamples: clip.fadeInSamples,
        fadeOutSamples: clip.fadeOutSamples,
      };
    }));
  return sealAudioProgramPlan({
    frameRate: { ...programSpace.frameRate },
    frameCount,
    sampleRate: 48_000,
    sampleFrames: programFrameSampleBoundary(programSpace, frameCount, 48_000),
    clips,
    mix: { normalize: false, limiter: "none" },
  });
}
