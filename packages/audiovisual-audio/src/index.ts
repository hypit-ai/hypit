import { sealAudioProgram, type AudioFilterProgram, type AudioProgram } from "@hypit/audio-program";
import { assertAudiovisualProgram, type AudioOperator, type AudiovisualProgram } from "@hypit/audiovisual";
import type { ResolvedMedia } from "@hypit/media";

export const audiovisualAudioContributionKind = "hypit.audiovisual-audio";

export type AudiovisualAudioOperatorCompiler = {
  readonly symbol: string;
  compile(operator: AudioOperator): Omit<AudioFilterProgram, "controls">;
};

export type AudiovisualAudioContribution = {
  readonly kind: typeof audiovisualAudioContributionKind;
  readonly package: string;
  readonly operators?: readonly AudiovisualAudioOperatorCompiler[];
};

const key = (packageName: string, symbol: string): string => `${packageName}\u0000${symbol}`;

function media(value: unknown, source: string): ResolvedMedia {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Audio Source ${source} has no resolved Media.`);
  }
  return structuredClone(value) as ResolvedMedia;
}

export function lowerAudiovisualAudioProgram(input: {
  readonly program: AudiovisualProgram;
  readonly contributions: readonly AudiovisualAudioContribution[];
  readonly sampleRate: number;
  readonly channels: 1 | 2;
}): AudioProgram {
  assertAudiovisualProgram(input.program);
  const graph = input.program.audio;
  if (graph === undefined) throw new Error("Audio lowering requires an AVIR Audio graph.");
  const compilers = new Map<string, (operator: AudioOperator) => Omit<AudioFilterProgram, "controls">>();
  for (const contribution of input.contributions) for (const operator of contribution.operators ?? []) {
    const identity = key(contribution.package, operator.symbol);
    if (compilers.has(identity)) throw new Error(`Audio Terminal repeats Operator ${contribution.package}#${operator.symbol}.`);
    compilers.set(identity, operator.compile);
  }
  const nodes: AudioProgram["nodes"] = Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => {
    if (node.kind === "silence") return [id, { kind: "silence", id }];
    if (node.kind === "restrict") return [id, { kind: "restrict", id, input: node.input, range: structuredClone(node.range) }];
    if (node.kind === "mix") return [id, { kind: "mix", id, inputs: [...node.inputs] }];
    if (node.kind === "use") {
      const occurrence = input.program.occurrences[node.occurrence]!;
      const selection = occurrence.selections[node.output];
      if (selection?.kind !== "signal") throw new Error(`Audio use ${id} requires a signal selection.`);
      if (selection.reconstruction !== undefined) {
        throw new Error(`Audio Terminal has no Reconstruction implementation ${selection.reconstruction.implementation.package}#${selection.reconstruction.implementation.symbol}.`);
      }
      if (occurrence.source.implementation.package !== "@hypit/audiovisual"
        || occurrence.source.implementation.symbol !== "resolved-media") {
        throw new Error(`Audio Terminal has no Source implementation ${occurrence.source.implementation.package}#${occurrence.source.implementation.symbol}.`);
      }
      return [id, { kind: "media", id, media: media(occurrence.source.parameters.media, occurrence.source.id),
        output: node.output, targetStart: structuredClone(occurrence.placement.start),
        targetRange: structuredClone(occurrence.placement.active), mapping: structuredClone(selection.mapping) }];
    }
    const compiler = compilers.get(key(node.operator.implementation.package, node.operator.implementation.symbol));
    if (compiler === undefined) throw new Error(`Audio Terminal has no Operator implementation ${node.operator.implementation.package}#${node.operator.implementation.symbol}.`);
    const program = compiler(node.operator);
    return [id, { kind: "process", id, inputs: structuredClone(node.inputs),
      program: { ...program, controls: structuredClone(node.controlMappings) } }];
  }));
  return sealAudioProgram({ domain: structuredClone(input.program.domain), sampleRate: input.sampleRate,
    channels: input.channels, nodes, root: graph.root });
}
