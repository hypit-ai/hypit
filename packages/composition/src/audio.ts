import { compareCodeUnits } from "@hypit/hypit/protocol";
import { compareExactTemporalValues } from "@hypit/temporal";
import type {
  AudioClip,
  AudioSignalRef,
  AudioGraphNode,
  AudioSignalGraph,
  AudioTrack
} from "./types.js";

export function audioTrackContent(value: Omit<AudioTrack, "kind">): AudioTrack {
  const signalKey = (reference: AudioSignalRef): string => `${reference.node}\u0000${reference.port}`;
  const nodeContent = (node: AudioGraphNode): AudioGraphNode => {
    if (node.kind === "mix") {
      return {
        kind: "mix",
        id: node.id,
        // A Mix input is a signal multiset: ordering has no audible meaning,
        // while repeated references remain repeated contributions.
        inputs: [...node.inputs].map((input) => ({ ...input }))
          .sort((left, right) => compareCodeUnits(signalKey(left), signalKey(right))),
      };
    }
    if (node.kind === "process") {
      return {
        kind: "process",
        id: node.id,
        inputs: Object.fromEntries(Object.entries(node.inputs)
          .sort(([left], [right]) => compareCodeUnits(left, right))
          .map(([port, input]) => [port, { ...input }])),
        program: structuredClone(node.program),
      };
    }
    return structuredClone(node);
  };
  return {
    kind: "audio",
    timelineId: value.timelineId,
    id: value.id,
    graph: {
      nodes: [...value.graph.nodes].map(nodeContent)
        .sort((left, right) => compareCodeUnits(left.id, right.id)),
      output: { ...value.graph.output },
    },
  };
}

export function audioSignal(node: string): AudioSignalRef {
  return { node, port: "signal" };
}

export function audioGraphFromClips(clips: readonly AudioClip[]): AudioSignalGraph {
  if (clips.length === 0) return { nodes: [{ kind: "silence", id: "silence" }], output: audioSignal("silence") };
  const ordered = [...clips].map((clip) => structuredClone(clip))
    .sort((left, right) => compareExactTemporalValues(left.target.start, right.target.start)
      || compareCodeUnits(left.id, right.id));
  const sources = ordered.map((clip, index) => ({
    kind: "source" as const,
    id: `source-${String(index + 1).padStart(4, "0")}`,
    clip,
  }));
  if (sources.length === 1) return { nodes: sources, output: audioSignal(sources[0]!.id) };
  const mix: AudioGraphNode = { kind: "mix", id: "mix", inputs: sources.map((source) => audioSignal(source.id)) };
  return { nodes: [...sources, mix], output: audioSignal(mix.id) };
}

export function audioTrackClips(track: AudioTrack): readonly AudioClip[] {
  return track.graph.nodes.flatMap((node) => node.kind === "source" ? [node.clip] : []);
}

export function sealAudioTrack(value: Omit<AudioTrack, "kind">): AudioTrack {
  return audioTrackContent(value);
}
