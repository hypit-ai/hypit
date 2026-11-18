import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  type LocalTemporalDomain,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { assertIdentity } from "@hypit/nle";
import type { AudioGraph, AudioNode, CompilationGraph } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRange(value: TemporalRange, domain: LocalTemporalDomain, label: string): void {
  assertExactTemporalValue(value.start, `${label}.start`);
  assertExactTemporalValue(value.end, `${label}.end`);
  assert(compareExactTemporalValues(value.start, value.end) < 0, `${label} must be non-empty.`);
  assert(compareExactTemporalValues(value.start, exactTemporalZero()) >= 0
    && compareExactTemporalValues(value.end, domain.duration) <= 0,
  `${label} lies outside Programme domain ${domain.id}.`);
}

export function audioInputs(node: AudioNode): readonly string[] {
  switch (node.kind) {
    case "silence": case "use": return [];
    case "restrict": return [node.input];
    case "mix": return node.inputs;
    case "apply": return [node.input];
  }
}

function assertNode(id: string, node: AudioNode, program: CompilationGraph): void {
  assertIdentity(id, "Audio node id");
  switch (node.kind) {
    case "silence": return;
    case "use": {
      const occurrence = program.occurrences[node.occurrence];
      assert(occurrence?.audio !== undefined, `Audio use ${id} requires a Audio read on ${node.occurrence}.`);
      return;
    }
    case "restrict": assertRange(node.range, program.domain, `Audio restrict ${id}`); return;
    case "mix": assert(node.inputs.length > 0, `Audio mix ${id} has no inputs.`); return;
    case "apply": return;
  }
}

export function assertAudioGraph(value: AudioGraph, program: CompilationGraph): void {
  assertIdentity(value.root, "AudioGraph.root");
  assert(value.nodes[value.root] !== undefined, `Programme ${program.id} has no Audio root node ${value.root}.`);
  const entries = Object.entries(value.nodes);
  assert(entries.length > 0, `Programme ${program.id} has no Audio nodes.`);
  for (const [id, node] of entries) assertNode(id, node, program);
}

export function audioGraphUses(value: AudioGraph): Set<string> {
  return new Set(Object.values(value.nodes).flatMap(node => node.kind === "use" ? [node.occurrence] : []));
}
