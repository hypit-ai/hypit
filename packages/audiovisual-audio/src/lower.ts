import { sealAudioProgram, verifyAudioProgram } from "@hypit/audio-program";
import type {
  AudioOutputSampling,
  AudioProgram,
  AudioProgramNode,
} from "@hypit/audio-program";
import { assertAudiovisualProgram } from "@hypit/audiovisual";
import type { AudiovisualProgram } from "@hypit/audiovisual";
import { compareExactTemporalValues } from "@hypit/temporal/algebra";

import { occurrenceAudioProgramUse } from "./source-use.js";
import { assertAudiovisualAudioOutput, resolveAudiovisualAudioSource } from "./source.js";
import type { AudiovisualAudioSourceSet } from "./source.js";

export type AudiovisualAudioLowering = {
  readonly program: AudiovisualProgram;
  readonly sampling: AudioOutputSampling;
  readonly sources: AudiovisualAudioSourceSet;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Lower one complete resolved AVIR Audio DAG into the continuous terminal AudioProgram. */
export function lowerAudiovisualAudioProgram(input: AudiovisualAudioLowering): AudioProgram {
  assertAudiovisualProgram(input.program);
  assertAudiovisualAudioOutput(input.sampling);
  const graph = input.program.audio;
  assert(graph !== undefined, `Audiovisual Programme ${input.program.id} has no Audio output.`);
  const nodeId = (id: string): string => `${input.program.id}:${id}`;
  const nodes = Object.entries(graph.nodes).map(([id, node]): AudioProgramNode => {
    const terminalId = nodeId(id);
    switch (node.kind) {
      case "silence": return { kind: "silence", id: terminalId };
      case "use": {
        const occurrence = input.program.occurrences[node.occurrence]!;
        const context = {
          id: terminalId,
          occurrence: structuredClone(occurrence),
          output: node.output,
        };
        const source = resolveAudiovisualAudioSource(
          input.sources,
          occurrence.source.id,
          node.output,
        ).program;
        verifyAudioProgram(source);
        const output = occurrence.source.outputs[node.output]!;
        assert(output.kind === "signal",
          `Audio Source ${occurrence.source.id}.${node.output} is constant and has no continuous domain.`);
        assert(source.domain.id === output.domain.id
          && compareExactTemporalValues(source.domain.duration, output.domain.duration) === 0,
        `Audio Source ${occurrence.source.id}.${node.output} returned Programme domain ${source.domain.id}.`);
        assert(source.sampling.sampleRate === input.sampling.sampleRate,
          `Audio Source ${occurrence.source.id}.${node.output} returned another sample rate.`);
        const use = occurrenceAudioProgramUse(context);
        return {
          kind: "program",
          id: terminalId,
          program: structuredClone(source),
          sampling: use.sampling,
          ...(use.reconstruction === undefined ? {} : {
            reconstruction: structuredClone(use.reconstruction),
          }),
          target: use.target,
        };
      }
      case "restrict": return {
        kind: "restrict",
        id: terminalId,
        input: { node: nodeId(node.input) },
        range: structuredClone(node.range),
      };
      case "mix": return {
        kind: "mix",
        id: terminalId,
        inputs: node.inputs.map((child) => ({ node: nodeId(child) })),
      };
      case "apply": return {
        kind: "process",
        id: terminalId,
        inputs: Object.fromEntries(Object.entries(node.inputs)
          .map(([port, child]) => [port, { node: nodeId(child) }])),
        program: structuredClone(node.operator.program),
        temporalSupport: structuredClone(node.operator.temporalSupport),
        controlMappings: structuredClone(node.controlMappings),
      };
    }
  });
  return sealAudioProgram({
    domain: structuredClone(input.program.domain),
    sampling: structuredClone(input.sampling),
    graph: { nodes, output: { node: nodeId(graph.root) } },
  });
}
