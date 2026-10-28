import { clockFrameSampleBoundary, timelineFrameCount, timelineFrameSampleBoundary } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import {
  assertAudioLevelAutomation,
  assertAudioReconstructionProgram,
  assertAudioTrackIdentity,
  assertCompositionIdentity,
  readAudioGainProcess,
  sealComposition,
} from "@hypit/composition";
import type { AudioClip, AudioSignalRef, AudioTrack, Composition } from "@hypit/composition";
import { canonicalize } from "@hypit/hypit/protocol";
import { verifyPreparedAudioSource } from "@hypit/media";
import {
  addExactTemporalValues,
  assertTemporalMap,
  compareExactTemporalValues,
  exactTemporalRational,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { ExactTemporalValue } from "@hypit/temporal";

import type { AudioProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sampleBoundary(value: ExactTemporalValue, label: string): number {
  const exact = exactTemporalRational(value);
  const numerator = exact.numerator * 48_000n;
  const rounded = numerator >= 0n
    ? (numerator * 2n + exact.denominator) / (exact.denominator * 2n)
    : -((-numerator * 2n + exact.denominator) / (exact.denominator * 2n));
  assert(rounded >= 0n && rounded <= BigInt(Number.MAX_SAFE_INTEGER), `${label} is outside sample arithmetic`);
  return Number(rounded);
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
  verifyAudioProgram(value);
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
    verifyPreparedAudioSource(clip.source);
    assertTemporalMap(clip.preparation);
    assertTemporalMap(clip.sampling);
    if (clip.reconstruction !== undefined) {
      assertAudioReconstructionProgram(clip.reconstruction, `AudioProgram clip ${clip.id} reconstruction`);
    }
    assert(compareExactTemporalValues(clip.target.start, clip.target.end) < 0,
      `AudioProgram clip ${clip.id} exact target interval is invalid`);
    assert(Number.isSafeInteger(clip.targetStartSample) && clip.targetStartSample >= 0
      && Number.isSafeInteger(clip.targetEndSampleExclusive)
      && clip.targetEndSampleExclusive > clip.targetStartSample
      && clip.targetEndSampleExclusive <= item.sampleFrames,
    `AudioProgram clip ${clip.id} target interval is invalid`);
    const preparedDomain = clip.preparation.stages[0]!.target;
    const sourceDomain = clip.preparation.stages.at(-1)!.source;
    assert(sourceDomain.id === clip.source.sourceDomain.id
      && compareExactTemporalValues(sourceDomain.duration, clip.source.sourceDomain.duration) === 0,
    `AudioProgram clip ${clip.id} preparation does not end at its selected audio source`);
    const samplingTarget = clip.sampling.stages[0]!.target;
    const samplingSource = clip.sampling.stages.at(-1)!.source;
    assert(compareExactTemporalValues(samplingTarget.duration,
      subtractExactTemporalValues(clip.target.end, clip.target.start)) === 0,
    `AudioProgram clip ${clip.id} sampling target differs from its exact target interval`);
    assert(sampleBoundary(clip.target.start, `AudioProgram clip ${clip.id} target start`)
      === clip.targetStartSample
      && sampleBoundary(clip.target.end, `AudioProgram clip ${clip.id} target end`)
        === clip.targetEndSampleExclusive,
    `AudioProgram clip ${clip.id} target samples differ from its exact interval`);
    assert(samplingSource.id === preparedDomain.id
      && compareExactTemporalValues(samplingSource.duration, preparedDomain.duration) === 0,
    `AudioProgram clip ${clip.id} sampling does not end at its PreparedMedia domain`);
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
}

export function compileAudioProgram(composition: Composition, timeline: Timeline): AudioProgram {
  assertCompositionIdentity(composition, timeline);
  // Composition owns the additive root multiset. Canonicalize here as well as
  // in official constructors so an equivalent value from any package lowers
  // to the same private route ordinals.
  const canonicalComposition = sealComposition(composition);
  const frameCount = timelineFrameCount(timeline);
  const clips = canonicalComposition.audio
    .flatMap((track, rootIndex) => routedTrackClips(track, rootIndex).map(({ clip, path, gain: routeGain }) => {
      assertTemporalMap(clip.sampling);
      const mixStartSample = sampleBoundary(clip.target.start, `${track.id}.${clip.id} target start`);
      const mixEndSampleExclusive = sampleBoundary(clip.target.end, `${track.id}.${clip.id} target end`);
      const fadeInSamples = sampleBoundary(addExactTemporalValues(clip.target.start, clip.fadeIn),
        `${track.id}.${clip.id} fade in`) - mixStartSample;
      const fadeOutSamples = mixEndSampleExclusive - sampleBoundary(
        subtractExactTemporalValues(clip.target.end, clip.fadeOut), `${track.id}.${clip.id} fade out`);
      return {
        id: structuralId([...path, "clip", clip.id]),
        source: structuredClone(clip.source),
        preparation: structuredClone(clip.preparation),
        sampling: structuredClone(clip.sampling),
        ...(clip.reconstruction === undefined ? {} : { reconstruction: structuredClone(clip.reconstruction) }),
        target: structuredClone(clip.target),
        targetStartSample: mixStartSample,
        targetEndSampleExclusive: mixEndSampleExclusive,
        mixStartSample,
        mixEndSampleExclusive,
        gain: (() => {
          const gain = clip.gain * routeGain;
          assert(Number.isFinite(gain), `Audio clip ${track.id}.${clip.id} composed gain is not finite`);
          return gain;
        })(),
        fadeInSamples,
        fadeOutSamples,
        ...(clip.gainEnvelope === undefined ? {} : { gainEnvelope: clip.gainEnvelope }),
        ...(clip.audibility === undefined ? {} : { audibility: clip.audibility.flatMap((span) => {
          const startSample = Math.max(span.startSample, mixStartSample);
          const endSampleExclusive = Math.min(span.endSampleExclusive, mixEndSampleExclusive);
          return endSampleExclusive <= startSample ? [] : [{ startSample, endSampleExclusive }];
        }) }),
      };
    }));
  const program = sealAudioProgram({
    frameRate: { ...timeline.frameRate },
    frameCount,
    sampleRate: 48_000,
    sampleFrames: timelineFrameSampleBoundary(timeline, frameCount, 48_000),
    clips,
  });
  verifyAudioProgram(program);
  return program;
}
