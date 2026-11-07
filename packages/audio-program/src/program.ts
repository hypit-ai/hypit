import { assertOperatorTemporalSupport, assertSignalOperatorProgram } from "@hypit/audiovisual";
import { canonicalize } from "@hypit/protocol";
import { verifyPreparedAudioSource } from "@hypit/media";
import {
  assertLocalTemporalDomain,
  assertTemporalMap,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";
import type { ExactTemporalValue, TemporalMap } from "@hypit/temporal/algebra";
import { resolveTemporalBoundary } from "@hypit/temporal/sampling";

import type {
  AudioProgram,
  AudioProgramMediaSource,
  AudioProgramNode,
  AudioOutputSampling,
  AudioProgramSignalRef,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSampling(value: AudioOutputSampling): void {
  assert(Number.isSafeInteger(value.sampleRate) && value.sampleRate > 0,
    "AudioProgram sample rate must be a positive safe integer");
}

function sampleBoundary(value: ExactTemporalValue, sampling: AudioOutputSampling, label: string): number {
  try {
    return resolveTemporalBoundary(value,
      { frameRate: { numerator: sampling.sampleRate, denominator: 1 } }, "nearest");
  } catch {
    throw new Error(`${label} is outside sample arithmetic`);
  }
}

export function audioProgramSampleFrames(
  program: Pick<AudioProgram, "domain" | "sampling">,
): number {
  assertLocalTemporalDomain(program.domain);
  assertSampling(program.sampling);
  return sampleBoundary(program.domain.duration, program.sampling, "AudioProgram duration");
}

export function audioProgramUseSampleSpan(
  use: { readonly id: string; readonly target: import("@hypit/temporal/algebra").TemporalRange },
  sampling: AudioOutputSampling,
): { readonly startSample: number; readonly endSampleExclusive: number } {
  return {
    startSample: sampleBoundary(use.target.start, sampling, `AudioProgram use ${use.id} target start`),
    endSampleExclusive: sampleBoundary(use.target.end, sampling,
      `AudioProgram use ${use.id} target end`),
  };
}

function structuralId(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join(":");
}

export function sealAudioProgram(value: AudioProgram): AudioProgram {
  verifyAudioProgram(value);
  return canonicalize(value) as unknown as AudioProgram;
}

export function audioProgramMediaSources(program: AudioProgram): readonly AudioProgramMediaSource[] {
  verifyAudioProgram(program);
  return program.graph.nodes.flatMap((node): readonly AudioProgramMediaSource[] => {
    if (node.kind === "source") return [node.media];
    if (node.kind === "program") return audioProgramMediaSources(node.program);
    return [];
  });
}

/** Construct the ordinary source-plus-root-mix subset without changing the graph value model. */
export function audioProgramGraphFromMediaSources(sources: readonly AudioProgramMediaSource[]): AudioProgram["graph"] {
  const nodes: AudioProgramNode[] = sources.map((media, index) => ({
    kind: "source",
    id: structuralId(["source", String(index)]),
    media: structuredClone(media),
  }));
  if (nodes.length === 0) return { nodes: [{ kind: "silence", id: "root" }], output: { node: "root" } };
  if (nodes.length === 1) return { nodes, output: { node: nodes[0]!.id } };
  const inputs = nodes.map((node) => ({ node: node.id }));
  nodes.push({ kind: "mix", id: "root", inputs });
  return { nodes, output: { node: "root" } };
}

function verifyAudioProgramValue(value: unknown, ancestors: Set<object>): asserts value is AudioProgram {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "AudioProgram must be an object");
  const item = value as AudioProgram;
  assert(!ancestors.has(item), "AudioProgram nesting contains a cycle");
  ancestors.add(item);
  assertLocalTemporalDomain(item.domain);
  assertSampling(item.sampling);
  const sampleFrames = audioProgramSampleFrames(item);
  assert(sampleFrames > 0, "AudioProgram duration has no output samples");
  assert(item.graph !== null && typeof item.graph === "object" && !Array.isArray(item.graph)
    && Array.isArray(item.graph.nodes), "AudioProgram graph is invalid");
  const nodes = new Map<string, AudioProgramNode>();
  const references = new Map<string, readonly AudioProgramSignalRef[]>();
  for (const node of item.graph.nodes) {
    assert(typeof node.id === "string" && node.id.length > 0 && !nodes.has(node.id),
      "AudioProgram node id is empty or repeated");
    nodes.set(node.id, node);
    if (node.kind === "silence" || node.kind === "source" || node.kind === "program") references.set(node.id, []);
    else if (node.kind === "restrict") {
      assert(compareExactTemporalValues(node.range.start, exactTemporalZero()) >= 0
        && compareExactTemporalValues(node.range.start, node.range.end) < 0
        && compareExactTemporalValues(node.range.end, item.domain.duration) <= 0,
      `AudioProgram Restrict ${node.id} range lies outside Programme domain`);
      references.set(node.id, [node.input]);
    }
    else if (node.kind === "mix") {
      assert(Array.isArray(node.inputs) && node.inputs.length > 0, `AudioProgram Mix ${node.id} has no inputs`);
      references.set(node.id, node.inputs);
    } else {
      assert(node.kind === "process" && node.inputs !== null && typeof node.inputs === "object"
        && !Array.isArray(node.inputs) && Object.keys(node.inputs).length > 0,
      `AudioProgram Process ${node.id} is invalid`);
      assertSignalOperatorProgram(node.program, `AudioProgram Process ${node.id}`);
      assertOperatorTemporalSupport(node.temporalSupport, Object.keys(node.inputs),
        `AudioProgram Process ${node.id} temporal support`);
      assert(node.controlMappings !== null && typeof node.controlMappings === "object"
        && !Array.isArray(node.controlMappings), `AudioProgram Process ${node.id} Controls are invalid`);
      for (const [name, mapping] of Object.entries(node.controlMappings) as [string, TemporalMap][]) {
        assert(typeof name === "string" && name.length > 0,
          `AudioProgram Process ${node.id} has an invalid Control name`);
        assertTemporalMap(mapping);
        const target = mapping.stages[0]!.target;
        assert(target.id === item.domain.id
          && compareExactTemporalValues(target.duration, item.domain.duration) === 0,
        `AudioProgram Process ${node.id} Control ${name} does not begin in Programme domain ${item.domain.id}`);
      }
      references.set(node.id, Object.values(node.inputs));
    }
  }
  const assertReference = (reference: AudioProgramSignalRef, label: string): void => {
    assert(reference !== null && typeof reference === "object" && typeof reference.node === "string"
      && nodes.has(reference.node), `${label} is invalid`);
  };
  assertReference(item.graph.output, "AudioProgram output");
  for (const [node, inputs] of references) for (const [index, input] of inputs.entries()) {
    assertReference(input, `AudioProgram ${node} input ${index}`);
  }
  const state = new Map<string, "visiting" | "visited">();
  const reachable = new Set<string>();
  const visits: Array<{ readonly id: string; readonly leaving: boolean }> = [
    { id: item.graph.output.node, leaving: false },
  ];
  while (visits.length > 0) {
    const visit = visits.pop()!;
    if (visit.leaving) {
      state.set(visit.id, "visited");
      continue;
    }
    assert(state.get(visit.id) !== "visiting", `AudioProgram graph contains a cycle at ${visit.id}`);
    if (state.get(visit.id) === "visited") continue;
    state.set(visit.id, "visiting");
    reachable.add(visit.id);
    visits.push({ id: visit.id, leaving: true });
    const inputs = references.get(visit.id) ?? [];
    for (let index = inputs.length - 1; index >= 0; index -= 1) {
      visits.push({ id: inputs[index]!.node, leaving: false });
    }
  }
  assert(reachable.size === nodes.size, "AudioProgram graph contains unreachable nodes");
  for (const node of item.graph.nodes) {
    if (node.kind !== "program") continue;
    verifyAudioProgramValue(node.program, ancestors);
    if (node.reconstruction !== undefined) {
      assertSignalOperatorProgram(node.reconstruction,
        `AudioProgram nested Programme ${node.id} reconstruction`);
    }
    assert(node.program.sampling.sampleRate === item.sampling.sampleRate,
      `AudioProgram nested Programme ${node.id} uses another sample rate`);
    assertTemporalMap(node.sampling);
    assert(compareExactTemporalValues(node.target.start, node.target.end) < 0,
      `AudioProgram nested Programme ${node.id} exact target interval is invalid`);
    const target = audioProgramUseSampleSpan(node, item.sampling);
    assert(target.startSample >= 0 && target.endSampleExclusive > target.startSample
      && target.endSampleExclusive <= sampleFrames,
    `AudioProgram nested Programme ${node.id} target interval is invalid`);
    const samplingTarget = node.sampling.stages[0]!.target;
    const samplingSource = node.sampling.stages.at(-1)!.source;
    assert(compareExactTemporalValues(samplingTarget.duration,
      subtractExactTemporalValues(node.target.end, node.target.start)) === 0,
    `AudioProgram nested Programme ${node.id} sampling target differs from its exact target interval`);
    assert(samplingSource.id === node.program.domain.id
      && compareExactTemporalValues(samplingSource.duration, node.program.domain.duration) === 0,
    `AudioProgram nested Programme ${node.id} sampling does not end at its child domain`);
  }
  const mediaIds = new Set<string>();
  for (const media of item.graph.nodes.flatMap((node) => node.kind === "source" ? [node.media] : [])) {
    assert(typeof media.id === "string" && media.id.length > 0 && !mediaIds.has(media.id),
      "AudioProgram media source id is empty or repeated");
    mediaIds.add(media.id);
    verifyPreparedAudioSource(media.source);
    assertTemporalMap(media.preparation);
    const preparedDomain = media.preparation.stages[0]!.target;
    const sourceDomain = media.preparation.stages.at(-1)!.source;
    assert(preparedDomain.id === item.domain.id
      && compareExactTemporalValues(preparedDomain.duration, item.domain.duration) === 0,
    `AudioProgram media source ${media.id} preparation does not begin in Programme domain ${item.domain.id}`);
    assert(sourceDomain.id === media.source.sourceDomain.id
      && compareExactTemporalValues(sourceDomain.duration, media.source.sourceDomain.duration) === 0,
    `AudioProgram media source ${media.id} preparation does not end at its selected audio source`);
  }
  ancestors.delete(item);
}

export function verifyAudioProgram(value: unknown): asserts value is AudioProgram {
  verifyAudioProgramValue(value, new Set<object>());
}
