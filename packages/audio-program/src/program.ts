import { clockFrameSampleBoundary, timelineFrameCount, timelineFrameSampleBoundary } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import {
  assertAudioLevelAutomation,
  assertAudioProcessProgram,
  assertAudioReconstructionProgram,
  assertAudioTrackIdentity,
  readAudioGainProcess,
  sealAudioTrack,
} from "@hypit/composition";
import type {
  AudioClip,
  Composition,
  AudioSignalRef,
  AudioTrack,
} from "@hypit/composition";
import { canonicalStringify, canonicalize, compareCodeUnits } from "@hypit/hypit/protocol";
import { verifyPreparedAudioSource } from "@hypit/media";
import {
  addExactTemporalValues,
  assertTemporalMap,
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalValueFromFrames,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { ExactTemporalValue } from "@hypit/temporal";

import type {
  AudioProgram,
  AudioProgramClip,
  AudioProgramGainRoute,
  AudioProgramNode,
} from "./types.js";

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

function structuralId(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join(":");
}

function lowerClip(clip: AudioClip, id: string, owner: string): AudioProgramClip {
  assertTemporalMap(clip.sampling);
  const mixStartSample = sampleBoundary(clip.target.start, `${owner}.${clip.id} target start`);
  const mixEndSampleExclusive = sampleBoundary(clip.target.end, `${owner}.${clip.id} target end`);
  return {
    id,
    source: structuredClone(clip.source),
    preparation: structuredClone(clip.preparation),
    sampling: structuredClone(clip.sampling),
    ...(clip.reconstruction === undefined ? {} : { reconstruction: structuredClone(clip.reconstruction) }),
    target: structuredClone(clip.target),
    targetStartSample: mixStartSample,
    targetEndSampleExclusive: mixEndSampleExclusive,
    mixStartSample,
    mixEndSampleExclusive,
    gain: clip.gain,
    fadeInSamples: sampleBoundary(addExactTemporalValues(clip.target.start, clip.fadeIn),
      `${owner}.${clip.id} fade in`) - mixStartSample,
    fadeOutSamples: mixEndSampleExclusive - sampleBoundary(
      subtractExactTemporalValues(clip.target.end, clip.fadeOut), `${owner}.${clip.id} fade out`),
    ...(clip.gainEnvelope === undefined ? {} : { gainEnvelope: structuredClone(clip.gainEnvelope) }),
    ...(clip.audibility === undefined ? {} : { audibility: clip.audibility.flatMap((span) => {
      const startSample = Math.max(span.startSample, mixStartSample);
      const endSampleExclusive = Math.min(span.endSampleExclusive, mixEndSampleExclusive);
      return endSampleExclusive <= startSample ? [] : [{ startSample, endSampleExclusive }];
    }) }),
  };
}

function namespaceTrack(track: AudioTrack, rootIndex: number): {
  readonly nodes: readonly AudioProgramNode[];
  readonly output: AudioSignalRef;
} {
  assertAudioTrackIdentity(track);
  const nodeId = (id: string): string => structuralId(["audio", String(rootIndex), "track", track.id, "node", id]);
  const reference = (input: AudioSignalRef): AudioSignalRef => ({ node: nodeId(input.node), port: "signal" });
  const nodes = track.graph.nodes.map((node): AudioProgramNode => {
    const id = nodeId(node.id);
    if (node.kind === "silence") return { kind: "silence", id };
    if (node.kind === "source") return {
      kind: "source",
      id,
      clip: lowerClip(node.clip, structuralId(["audio", String(rootIndex), "track", track.id,
        "node", node.id, "clip", node.clip.id]), track.id),
    };
    if (node.kind === "composition") {
      const targetStartSample = sampleBoundary(node.target.start, `${track.id}.${node.id} target start`);
      const targetEndSampleExclusive = sampleBoundary(node.target.end, `${track.id}.${node.id} target end`);
      return {
        kind: "composition",
        id,
        program: compileAudioProgram(node.composition),
        target: structuredClone(node.target),
        targetStartSample,
        targetEndSampleExclusive,
        sampling: structuredClone(node.sampling),
        ...(node.reconstruction === undefined ? {} : { reconstruction: structuredClone(node.reconstruction) }),
        gain: node.gain,
        fadeInSamples: sampleBoundary(addExactTemporalValues(node.target.start, node.fadeIn),
          `${track.id}.${node.id} fade in`) - targetStartSample,
        fadeOutSamples: targetEndSampleExclusive - sampleBoundary(
          subtractExactTemporalValues(node.target.end, node.fadeOut), `${track.id}.${node.id} fade out`),
      };
    }
    if (node.kind === "mix") return { kind: "mix", id, inputs: node.inputs.map(reference) };
    return {
      kind: "process",
      id,
      inputs: Object.fromEntries(Object.entries(node.inputs).map(([port, input]) => [port, reference(input)])),
      program: structuredClone(node.program),
    };
  });
  return { nodes, output: reference(track.graph.output) };
}

export function sealAudioProgram(value: AudioProgram): AudioProgram {
  verifyAudioProgram(value);
  return canonicalize(value) as unknown as AudioProgram;
}

export function audioProgramSourceClips(program: AudioProgram): readonly AudioProgramClip[] {
  verifyAudioProgram(program);
  return program.graph.nodes.flatMap((node) => node.kind === "source" ? [node.clip]
    : node.kind === "composition" ? audioProgramSourceClips(node.program) : []);
}

/** Construct the ordinary source-plus-root-mix subset without changing the graph value model. */
export function audioProgramGraphFromClips(clips: readonly AudioProgramClip[]): AudioProgram["graph"] {
  const nodes: AudioProgramNode[] = clips.map((clip, index) => ({
    kind: "source",
    id: structuralId(["source", String(index)]),
    clip: structuredClone(clip),
  }));
  if (nodes.length === 0) return { nodes: [{ kind: "silence", id: "root" }], output: { node: "root", port: "signal" } };
  if (nodes.length === 1) return { nodes, output: { node: nodes[0]!.id, port: "signal" } };
  const inputs = nodes.map((node) => ({ node: node.id, port: "signal" as const }));
  nodes.push({ kind: "mix", id: "root", inputs });
  return { nodes, output: { node: "root", port: "signal" } };
}

/** Lower the executable gain-only subset without erasing the public programme graph. */
export function audioProgramGainRoutes(program: AudioProgram): readonly AudioProgramGainRoute[] {
  verifyAudioProgram(program);
  const nodes = new Map(program.graph.nodes.map((node) => [node.id, node] as const));
  const route = (input: AudioSignalRef, path: readonly string[], gain: number): AudioProgramGainRoute[] => {
    const node = nodes.get(input.node)!;
    if (node.kind === "silence") return [];
    if (node.kind === "source") return [{ id: structuralId([...path, "source", node.id]), clip: node.clip, gain }];
    if (node.kind === "composition") {
      throw new Error(`Audio Composition ${node.id} requires recursive signal rendering.`);
    }
    if (node.kind === "mix") return node.inputs.flatMap((entry, index) =>
      route(entry, [...path, "mix", node.id, "input", String(index)], gain));
    if (Object.keys(node.inputs).some((port) => port !== "signal")) {
      throw new Error(`Audio Process ${node.id} has ports unsupported by ${node.program.format}.`);
    }
    const next = gain * readAudioGainProcess(node.program);
    assert(Number.isFinite(next), `Audio Process ${node.id} produces a non-finite composed gain.`);
    return route(node.inputs.signal!, [...path, "process", node.id], next);
  };
  return route(program.graph.output, ["output"], 1);
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
  assert(item.graph !== null && typeof item.graph === "object" && !Array.isArray(item.graph)
    && Array.isArray(item.graph.nodes), "AudioProgram graph is invalid");
  const nodes = new Map<string, AudioProgramNode>();
  const references = new Map<string, readonly AudioSignalRef[]>();
  for (const node of item.graph.nodes) {
    assert(typeof node.id === "string" && node.id.length > 0 && !nodes.has(node.id),
      "AudioProgram node id is empty or repeated");
    nodes.set(node.id, node);
    if (node.kind === "silence" || node.kind === "source" || node.kind === "composition") references.set(node.id, []);
    else if (node.kind === "mix") {
      assert(Array.isArray(node.inputs) && node.inputs.length > 0, `AudioProgram Mix ${node.id} has no inputs`);
      references.set(node.id, node.inputs);
    } else {
      assert(node.kind === "process" && node.inputs !== null && typeof node.inputs === "object"
        && node.inputs.signal !== undefined, `AudioProgram Process ${node.id} is invalid`);
      assertAudioProcessProgram(node.program, `AudioProgram Process ${node.id}`);
      references.set(node.id, Object.values(node.inputs));
    }
  }
  const assertReference = (reference: AudioSignalRef, label: string): void => {
    assert(reference?.port === "signal" && nodes.has(reference.node), `${label} is invalid`);
  };
  assertReference(item.graph.output, "AudioProgram output");
  for (const [node, inputs] of references) for (const [index, input] of inputs.entries()) {
    assertReference(input, `AudioProgram ${node} input ${index}`);
  }
  const state = new Map<string, "visiting" | "visited">();
  const reachable = new Set<string>();
  const visit = (id: string): void => {
    assert(state.get(id) !== "visiting", `AudioProgram graph contains a cycle at ${id}`);
    if (state.get(id) === "visited") return;
    state.set(id, "visiting");
    reachable.add(id);
    for (const input of references.get(id) ?? []) visit(input.node);
    state.set(id, "visited");
  };
  visit(item.graph.output.node);
  assert(reachable.size === nodes.size, "AudioProgram graph contains unreachable nodes");
  const clipIds = new Set<string>();
  for (const clip of item.graph.nodes.flatMap((node) => node.kind === "source" ? [node.clip] : [])) {
    assert(typeof clip.id === "string" && clip.id.length > 0 && !clipIds.has(clip.id),
      "AudioProgram clip id is empty or repeated");
    clipIds.add(clip.id);
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
    assert(Number.isFinite(clip.gain) && clip.gain >= 0, `AudioProgram clip ${clip.id} gain is invalid`);
    assertAudioLevelAutomation(clip,
      { startSample: clip.targetStartSample, endSampleExclusive: clip.targetEndSampleExclusive }, item.sampleFrames);
    const mixLength = clip.mixEndSampleExclusive - clip.mixStartSample;
    assert(Number.isSafeInteger(clip.fadeInSamples) && clip.fadeInSamples >= 0 && clip.fadeInSamples <= mixLength
      && Number.isSafeInteger(clip.fadeOutSamples) && clip.fadeOutSamples >= 0 && clip.fadeOutSamples <= mixLength,
    `AudioProgram clip ${clip.id} fade is invalid`);
  }
  for (const node of item.graph.nodes) {
    if (node.kind !== "composition") continue;
    verifyAudioProgram(node.program);
    assertTemporalMap(node.sampling);
    if (node.reconstruction !== undefined) {
      assertAudioReconstructionProgram(node.reconstruction, `AudioProgram Composition ${node.id} reconstruction`);
    }
    assert(compareExactTemporalValues(node.target.start, node.target.end) < 0
      && Number.isSafeInteger(node.targetStartSample) && node.targetStartSample >= 0
      && Number.isSafeInteger(node.targetEndSampleExclusive)
      && node.targetEndSampleExclusive > node.targetStartSample
      && node.targetEndSampleExclusive <= item.sampleFrames,
    `AudioProgram Composition ${node.id} target interval is invalid`);
    assert(node.sampling.stages.at(-1)?.source.duration !== undefined
      && compareExactTemporalValues(node.sampling.stages.at(-1)!.source.duration,
        exactTemporalValueFromFrames(node.program.frameCount, { frameRate: node.program.frameRate })) === 0,
    `AudioProgram Composition ${node.id} sampling source differs from its child programme`);
    assert(Number.isFinite(node.gain) && node.gain >= 0
      && Number.isSafeInteger(node.fadeInSamples) && node.fadeInSamples >= 0
      && Number.isSafeInteger(node.fadeOutSamples) && node.fadeOutSamples >= 0,
    `AudioProgram Composition ${node.id} gain or fades are invalid`);
  }
}

export function compileAudioProgram(value: Composition): AudioProgram {
  const composition = value.audio;
  const timeline = value.timeline;
  assert(composition !== null && typeof composition === "object" && !Array.isArray(composition)
    && Array.isArray(composition.contributions), "AudioComposition is invalid.");
  const contributions = composition.contributions.map((track) => {
    assertAudioTrackIdentity(track, timeline);
    return sealAudioTrack(track);
  }).sort((left, right) => compareCodeUnits(canonicalStringify(left), canonicalStringify(right)));
  const frameCount = timelineFrameCount(timeline);
  const nodes: AudioProgramNode[] = [];
  const outputs: AudioSignalRef[] = [];
  for (const [rootIndex, track] of contributions.entries()) {
    const nested = namespaceTrack(track, rootIndex);
    nodes.push(...nested.nodes);
    outputs.push(nested.output);
  }
  let output: AudioSignalRef;
  if (outputs.length === 0) {
    nodes.push({ kind: "silence", id: "root" });
    output = { node: "root", port: "signal" };
  } else if (outputs.length === 1) output = outputs[0]!;
  else {
    nodes.push({ kind: "mix", id: "root", inputs: outputs });
    output = { node: "root", port: "signal" };
  }
  const program = sealAudioProgram({
    frameRate: { ...timeline.frameRate },
    frameCount,
    sampleRate: 48_000,
    sampleFrames: timelineFrameSampleBoundary(timeline, frameCount, 48_000),
    graph: { nodes, output },
  });
  verifyAudioProgram(program);
  return program;
}
