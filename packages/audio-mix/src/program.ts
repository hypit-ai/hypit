import { assertAudioTrackIdentity, audioGainProcess, audioSignal, sealAudioTrack } from "@hypit/composition";
import type { AudioGraphNode, AudioSignalGraph, AudioSignalRef, AudioTrack } from "@hypit/composition";
import { compareCodeUnits } from "@hypit/hypit/protocol";
import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import type { AudioMixHeader, AudioMixInputSpec, AudioMixSet } from "./types.js";

function identity(value: string, label: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value)) throw new Error(`${label} is invalid.`);
}

export function sealAudioMixHeader(value: AudioMixHeader): AudioMixHeader {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("AudioMixHeader is invalid.");
  identity(value.id, "AudioMixHeader.id");
  return { id: value.id };
}

export function sealAudioMixInputSpec(value: AudioMixInputSpec): AudioMixInputSpec {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("AudioMixInputSpec is invalid.");
  identity(value.id, "AudioMixInputSpec.id");
  if (!Number.isFinite(value.gain) || value.gain < 0) throw new Error("AudioMixInputSpec.gain is invalid.");
  return { id: value.id, gain: value.gain };
}

export function createAudioMixSet(): AudioMixSet {
  return { inputs: [] };
}

export function assertAudioMixSet(set: AudioMixSet): void {
  if (set === null || typeof set !== "object" || Array.isArray(set) || !Array.isArray(set.inputs)) {
    throw new Error("AudioMixSet is invalid.");
  }
  const ids = new Set<string>();
  for (const [index, input] of set.inputs.entries()) {
    if (input === null || typeof input !== "object" || Array.isArray(input)
      || input.spec === null || typeof input.spec !== "object" || Array.isArray(input.spec)) {
      throw new Error(`AudioMixSet.inputs.${index} is invalid.`);
    }
    const spec = sealAudioMixInputSpec(input.spec);
    if (ids.has(spec.id)) throw new Error(`Audio Mix repeats Input ${spec.id}.`);
    ids.add(spec.id);
    assertAudioTrackIdentity(input.track);
  }
}

export function appendAudioMixInput(
  set: AudioMixSet,
  timeline: Timeline,
  spec: AudioMixInputSpec,
  track: AudioTrack,
): AudioMixSet {
  assertAudioMixSet(set);
  assertTimelineIdentity(timeline);
  const sealed = sealAudioMixInputSpec(spec);
  assertAudioTrackIdentity(track, timeline);
  if (set.inputs.some((input) => input.spec.id === sealed.id)) throw new Error(`Audio Mix repeats Input ${sealed.id}.`);
  return {
    inputs: [...set.inputs, { spec: sealed, track: structuredClone(track) }]
      .sort((left, right) => compareCodeUnits(left.spec.id, right.spec.id)),
  };
}

function structuralId(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join(":");
}

function namespaceGraph(graph: AudioSignalGraph, inputId: string): { readonly nodes: AudioGraphNode[]; readonly output: AudioSignalRef } {
  const nodeId = (value: string): string => structuralId(["input", inputId, "node", value]);
  const ref = (value: AudioSignalRef): AudioSignalRef => audioSignal(nodeId(value.node));
  return {
    nodes: graph.nodes.map((node): AudioGraphNode => {
      const id = nodeId(node.id);
      if (node.kind === "silence") return { kind: "silence", id };
      if (node.kind === "source") return { kind: "source", id, clip: {
        ...structuredClone(node.clip), id: structuralId(["input", inputId, "clip", node.clip.id]),
      } };
      if (node.kind === "mix") return { kind: "mix", id, inputs: node.inputs.map(ref) };
      return { kind: "process", id, inputs: Object.fromEntries(Object.entries(node.inputs).map(([port, input]) => [port, ref(input)])),
        program: structuredClone(node.program) };
    }),
    output: ref(graph.output),
  };
}

export function finalizeAudioMix(set: AudioMixSet, header: AudioMixHeader, timeline: Timeline): AudioTrack {
  assertAudioMixSet(set);
  if (set.inputs.length === 0) throw new Error("Audio Mix requires at least one Input.");
  const id = sealAudioMixHeader(header).id;
  assertTimelineIdentity(timeline);
  const nodes: AudioGraphNode[] = [];
  const outputs: AudioSignalRef[] = [];
  for (const input of set.inputs) {
    assertAudioTrackIdentity(input.track, timeline);
    const nested = namespaceGraph(input.track.graph, input.spec.id);
    nodes.push(...nested.nodes);
    if (input.spec.gain === 1) outputs.push(nested.output);
    else {
      const processId = structuralId(["input", input.spec.id, "process", "gain"]);
      nodes.push({ kind: "process", id: processId, inputs: { signal: nested.output }, program: audioGainProcess(input.spec.gain) });
      outputs.push(audioSignal(processId));
    }
  }
  const output = outputs.length === 1 ? outputs[0]! : audioSignal("mix");
  if (outputs.length > 1) nodes.push({ kind: "mix", id: "mix", inputs: outputs });
  const track = sealAudioTrack({ timelineId: timeline.id, id, graph: { nodes, output } });
  assertAudioTrackIdentity(track, timeline);
  return track;
}
