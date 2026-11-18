import { sealAudioProgram, type AudioProgram } from "@hypit/audio-program";
import type { CompilationGraph } from "./types.js";

export function compileAudio(input: {
  readonly program: CompilationGraph;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
}): AudioProgram {
  const graph = input.program.audio;
  if (graph === undefined) throw new Error("Audio compilation requires Audio output.");
  const nodes: AudioProgram["nodes"] = Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => {
    if (node.kind === "silence") return [id, { kind: "silence", id }];
    if (node.kind === "restrict") return [id, { kind: "restrict", id, input: node.input, range: structuredClone(node.range) }];
    if (node.kind === "mix") return [id, { kind: "mix", id, inputs: [...node.inputs] }];
    if (node.kind === "use") {
      const occurrence = input.program.occurrences[node.occurrence]!;
      const content = occurrence.content;
      if (content.kind !== "media" || occurrence.audio === undefined) throw new Error(`Audio use ${id} requires Media.`);
      return [id, { kind: "media", id, media: content.media, targetStart: occurrence.placement.start,
        targetRange: occurrence.placement.active, mapping: occurrence.audio }];
    }
    return [id, { kind: "process", id, inputs: { signal: node.input },
      program: { filter: node.filter, controls: node.controlMappings } }];
  }));
  return sealAudioProgram({ domain: structuredClone(input.program.domain), sampleRate: input.sampleRate,
    channels: input.channels, nodes, root: graph.root });
}
