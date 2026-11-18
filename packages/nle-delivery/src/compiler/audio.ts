import {
  assertExactTemporalValue,
  assertTemporalControlMapping,
  compareExactTemporalValues,
  exactTemporalZero,
  type LocalTemporalDomain,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { assertIdentity } from "@hypit/nle";
import { assertAudioOperator } from "./operator.js";
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

function references(node: AudioNode): readonly string[] {
  switch (node.kind) {
    case "silence": case "use": return [];
    case "restrict": return [node.input];
    case "mix": return node.inputs;
    case "apply": return Object.values(node.inputs);
  }
}

function assertNode(id: string, node: AudioNode, program: CompilationGraph): void {
  assertIdentity(id, "Audio node id");
  switch (node.kind) {
    case "silence": return;
    case "use": {
      const occurrence = program.occurrences[node.occurrence];
      assert(occurrence !== undefined, `Audio use ${id} references missing Occurrence ${node.occurrence}.`);
      const output = occurrence.source.outputs[node.output];
      assert(output !== undefined, `Audio use ${id} references missing Source output ${node.output}.`);
      assert(occurrence.selections[node.output] !== undefined,
        `Audio use ${id} has no Selection for Source output ${node.output}.`);
      assert(output.signal === "audio", `Audio use ${id} received ${output.signal}, expected audio.`);
      return;
    }
    case "restrict": assertRange(node.range, program.domain, `Audio restrict ${id}`); return;
    case "mix": assert(node.inputs.length > 0, `Audio mix ${id} has no inputs.`); return;
    case "apply": {
      assertAudioOperator(node.operator, `Audio apply ${id} operator`);
      const expected = new Set(node.operator.inputs);
      for (const name of Object.keys(node.inputs)) assert(expected.has(name), `Audio apply ${id} has unknown input ${name}.`);
      for (const name of expected) assert(node.inputs[name] !== undefined, `Audio apply ${id} is missing input ${name}.`);
      const controls = new Set(Object.keys(node.operator.temporalControls));
      for (const name of Object.keys(node.controlMappings)) assert(controls.has(name), `Audio apply ${id} has unknown Control ${name}.`);
      for (const name of controls) {
        const mapping = node.controlMappings[name];
        assert(mapping !== undefined, `Audio apply ${id} is missing Control Mapping ${name}.`);
        assertTemporalControlMapping(node.operator.temporalControls[name]!, mapping, program.domain);
      }
    }
  }
}

export function assertAudioGraph(value: AudioGraph, program: CompilationGraph): void {
  assertIdentity(value.root, "AudioGraph.root");
  assert(value.nodes[value.root] !== undefined, `Programme ${program.id} has no Audio root node ${value.root}.`);
  const entries = Object.entries(value.nodes);
  assert(entries.length > 0, `Programme ${program.id} has no Audio nodes.`);
  for (const [id, node] of entries) assertNode(id, node, program);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    const node = value.nodes[id];
    assert(node !== undefined, `Programme ${program.id} Audio graph references missing node ${id}.`);
    assert(!visiting.has(id), `Programme ${program.id} Audio graph contains a cycle through node ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const reference of references(node)) visit(reference);
    visiting.delete(id);
    visited.add(id);
  };
  visit(value.root);
  assert(visited.size === entries.length, `Programme ${program.id} Audio graph contains unreachable nodes.`);
}

export function audioGraphUses(value: AudioGraph): readonly { readonly occurrence: string; readonly output: string }[] {
  return Object.values(value.nodes).flatMap((node) => node.kind === "use"
    ? [{ occurrence: node.occurrence, output: node.output }] : []);
}
