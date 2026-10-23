import { clockFrameSampleBoundary, timelineFrameCount, timelineFrameSampleBoundary } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { assertAudioLevelAutomation, assertAudioTrackIdentity, assertCompositionIdentity, sealComposition } from "@hypit/composition";
import type { AudioClip, AudioProcessProgram, AudioSignalRef, AudioTrack, Composition } from "@hypit/composition";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";

import type { AudioProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exactInteger(value: { readonly numerator: number; readonly denominator: number }, label: string): number {
  assert(Number.isSafeInteger(value.numerator) && Number.isSafeInteger(value.denominator) && value.denominator > 0
    && value.numerator % value.denominator === 0, `${label} must resolve to an exact source-sample boundary`);
  const result = value.numerator / value.denominator;
  assert(Number.isSafeInteger(result) && result >= 0, `${label} is invalid`);
  return result;
}

function exactSourceEnd(sourceAtStart: { readonly numerator: number; readonly denominator: number },
  rate: { readonly numerator: number; readonly denominator: number }, targetLength: number, label: string): number {
  const numerator = BigInt(sourceAtStart.numerator) * BigInt(rate.denominator)
    + BigInt(targetLength) * BigInt(rate.numerator) * BigInt(sourceAtStart.denominator);
  const denominator = BigInt(sourceAtStart.denominator) * BigInt(rate.denominator);
  assert(numerator % denominator === 0n, `${label} must resolve to an exact source-sample boundary`);
  const result = numerator / denominator;
  assert(result >= 0n && result <= BigInt(Number.MAX_SAFE_INTEGER), `${label} is invalid`);
  return Number(result);
}

export const AUDIO_GAIN_PROCESS_FORMAT = "hypit.audio-gain@1" as const;

export function audioGainProcess(gain: number): AudioProcessProgram {
  assert(Number.isFinite(gain) && gain >= 0, "Audio Gain process is invalid");
  return { format: AUDIO_GAIN_PROCESS_FORMAT, payload: canonicalize({ gain }) as AudioProcessProgram["payload"], artifacts: [] };
}

export function readAudioGainProcess(program: AudioProcessProgram): number {
  if (program.format !== AUDIO_GAIN_PROCESS_FORMAT || program.artifacts.length !== 0) {
    throw new Error(`Audio compiler does not support Process format ${program.format}.`);
  }
  const payload = program.payload as { readonly gain?: unknown };
  if (Object.keys(payload).join("\u0000") !== "gain" || typeof payload.gain !== "number"
    || !Number.isFinite(payload.gain) || payload.gain < 0) {
    throw new Error("Audio Gain process payload is invalid.");
  }
  return payload.gain;
}

type RoutedClip = { readonly clip: AudioClip; readonly path: readonly string[]; readonly gain: number };

function structuralId(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join(":");
}

function routedTrackClips(track: AudioTrack, rootIndex: number): RoutedClip[] {
  assertAudioTrackIdentity(track);
  const nodes = new Map(track.graph.nodes.map((node) => [node.id, node] as const));
  const route = (reference: AudioSignalRef, path: readonly string[]): RoutedClip[] => {
    const node = nodes.get(reference.node)!;
    if (node.kind === "silence") return [];
    if (node.kind === "source") return [{ clip: node.clip, path: [...path, "source", node.id], gain: 1 }];
    if (node.kind === "mix") return node.inputs.flatMap((input, index) =>
      route(input, [...path, "mix", node.id, "input", String(index)]));
    if (Object.keys(node.inputs).some((port) => port !== "signal")) {
      throw new Error(`Audio Process ${track.id}.${node.id} has ports unsupported by ${node.program.format}.`);
    }
    const gain = readAudioGainProcess(node.program);
    return route(node.inputs.signal!, [...path, "process", node.id]).map((entry) => ({ ...entry, gain: entry.gain * gain }));
  };
  return route(track.graph.output, ["audio", String(rootIndex), "track", track.id]);
}

export function sealAudioProgram(value: AudioProgram): AudioProgram {
  return canonicalize(value) as unknown as AudioProgram;
}

export function verifyAudioProgram(value: unknown): asserts value is AudioProgram {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "AudioProgram must be an object");
  const item = value as AudioProgram;
  assert(Number.isSafeInteger(item.frameRate?.numerator) && item.frameRate.numerator > 0
    && Number.isSafeInteger(item.frameRate?.denominator) && item.frameRate.denominator > 0,
  "AudioProgram frame rate is invalid");
  assert(Number.isSafeInteger(item.frameCount) && item.frameCount > 0, "AudioProgram frame count is invalid");
  assert(item.sampleRate === 48_000, "AudioProgram sample rate must be 48000");
  assert(item.sampleFrames === clockFrameSampleBoundary({ frameRate: item.frameRate }, item.frameCount, 48_000),
    "AudioProgram sample count differs from its frame domain");
  assert(Array.isArray(item.clips), "AudioProgram clips are invalid");
  const ids = new Set<string>();
  for (const clip of item.clips) {
    assert(typeof clip.id === "string" && clip.id.length > 0 && !ids.has(clip.id),
      "AudioProgram clip id is empty or repeated");
    ids.add(clip.id);
    assertBlobRef(clip.artifact, `AudioProgram clip ${clip.id} Artifact`);
    assert(clip.artifact.mediaType === "audio/wav", `AudioProgram clip ${clip.id} must reference canonical WAV`);
    assert(Number.isSafeInteger(clip.targetStartSample) && clip.targetStartSample >= 0
      && Number.isSafeInteger(clip.targetEndSampleExclusive)
      && clip.targetEndSampleExclusive > clip.targetStartSample
      && clip.targetEndSampleExclusive <= item.sampleFrames,
    `AudioProgram clip ${clip.id} target interval is invalid`);
    assert(Number.isSafeInteger(clip.sourceStartSample) && clip.sourceStartSample >= 0,
      `AudioProgram clip ${clip.id} source start is invalid`);
    assert(Number.isSafeInteger(clip.sourceSampleFrames) && clip.sourceSampleFrames > 0
      && Number.isSafeInteger(clip.sourceEndSampleExclusive)
      && clip.sourceEndSampleExclusive > clip.sourceStartSample
      && clip.sourceEndSampleExclusive <= clip.sourceSampleFrames,
    `AudioProgram clip ${clip.id} source interval is invalid`);
    const sourceLength = clip.sourceEndSampleExclusive - clip.sourceStartSample;
    assert(typeof clip.sourceLoop === "boolean"
      && Number.isSafeInteger(clip.sourcePhaseSample) && clip.sourcePhaseSample >= 0
      && clip.sourcePhaseSample < sourceLength
      && (clip.sourceLoop || clip.sourcePhaseSample === 0),
    `AudioProgram clip ${clip.id} loop phase is invalid`);
    assert(Number.isFinite(clip.playbackRate) && clip.playbackRate > 0,
      `AudioProgram clip ${clip.id} playback rate is invalid`);
    assert(Number.isSafeInteger(clip.mixStartSample) && clip.mixStartSample >= 0
      && Number.isSafeInteger(clip.mixEndSampleExclusive) && clip.mixEndSampleExclusive > clip.mixStartSample
      && clip.targetStartSample >= clip.mixStartSample && clip.targetEndSampleExclusive <= clip.mixEndSampleExclusive,
    `AudioProgram clip ${clip.id} mix interval is invalid`);
    assert(Number.isFinite(clip.gain) && clip.gain >= 0,
      `AudioProgram clip ${clip.id} gain is invalid`);
    assertAudioLevelAutomation(clip, { startSample: clip.targetStartSample, endSampleExclusive: clip.targetEndSampleExclusive }, item.sampleFrames);
    const mixLength = clip.mixEndSampleExclusive - clip.mixStartSample;
    assert(Number.isSafeInteger(clip.fadeInSamples) && clip.fadeInSamples >= 0 && clip.fadeInSamples <= mixLength
      && Number.isSafeInteger(clip.fadeOutSamples) && clip.fadeOutSamples >= 0 && clip.fadeOutSamples <= mixLength,
    `AudioProgram clip ${clip.id} fade is invalid`);
  }
  assert(item.mix?.normalize === false && item.mix?.limiter === "none",
    "AudioProgram cannot hide normalization or limiting");
}

export function compileAudioProgram(composition: Composition, timeline: Timeline): AudioProgram {
  assertCompositionIdentity(composition, timeline);
  // Composition owns the additive root multiset. Canonicalize here as well as
  // in official constructors so an equivalent value from any package lowers
  // to the same private route ordinals.
  const canonicalComposition = sealComposition(composition);
  const frameCount = timelineFrameCount(timeline);
  const clips = canonicalComposition.audio
    .flatMap((track, rootIndex) => routedTrackClips(track, rootIndex).flatMap(({ clip, path, gain: routeGain }) => {
      if (clip.artifact.mediaType !== "audio/wav") {
        throw new Error(`Audio clip ${track.id}.${clip.id} must be normalized to canonical WAV before mixing`);
      }
      return clip.sourceTime.pieces.map((piece, pieceIndex) => {
        const targetLength = piece.target.endSampleExclusive - piece.target.startSample;
        const sourceAtStart = exactInteger(piece.sourceAtStart,
          `${track.id}.${clip.id} piece ${pieceIndex} source start`);
        const wrap = piece.wrap;
        return {
        id: structuralId([...path, "clip", clip.id, "piece", String(pieceIndex)]),
        artifact: {
          kind: "blob" as const,
          resource: clip.artifact.resource,
          size: clip.artifact.size,
          mediaType: clip.artifact.mediaType,
        },
        targetStartSample: clip.target.startSample + piece.target.startSample,
        targetEndSampleExclusive: clip.target.startSample + piece.target.endSampleExclusive,
        sourceSampleFrames: clip.sourceTime.sourceSampleFrames,
        sourceStartSample: wrap?.startSample ?? sourceAtStart,
        sourceEndSampleExclusive: wrap?.endSampleExclusive
          ?? exactSourceEnd(piece.sourceAtStart, piece.rate, targetLength,
            `${track.id}.${clip.id} piece ${pieceIndex} source end`),
        sourceLoop: wrap !== undefined,
        sourcePhaseSample: wrap === undefined ? 0 : sourceAtStart - wrap.startSample,
        playbackRate: piece.rate.numerator / piece.rate.denominator,
        mixStartSample: clip.target.startSample,
        mixEndSampleExclusive: clip.target.endSampleExclusive,
        gain: (() => {
          const gain = clip.gain * routeGain;
          assert(Number.isFinite(gain), `Audio clip ${track.id}.${clip.id} composed gain is not finite`);
          return gain;
        })(),
        fadeInSamples: clip.fadeInSamples,
        fadeOutSamples: clip.fadeOutSamples,
        ...(clip.gainEnvelope === undefined ? {} : { gainEnvelope: clip.gainEnvelope }),
        ...(clip.audibility === undefined ? {} : { audibility: clip.audibility.flatMap((span) => {
          const startSample = Math.max(span.startSample, clip.target.startSample + piece.target.startSample);
          const endSampleExclusive = Math.min(span.endSampleExclusive, clip.target.startSample + piece.target.endSampleExclusive);
          return endSampleExclusive <= startSample ? [] : [{ startSample, endSampleExclusive }];
        }) }),
      };
      });
    }));
  const program = sealAudioProgram({
    frameRate: { ...timeline.frameRate },
    frameCount,
    sampleRate: 48_000,
    sampleFrames: timelineFrameSampleBoundary(timeline, frameCount, 48_000),
    clips,
    mix: { normalize: false, limiter: "none" },
  });
  verifyAudioProgram(program);
  return program;
}
