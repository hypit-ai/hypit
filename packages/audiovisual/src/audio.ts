import { assertExactTemporalValue, compareExactTemporalValues } from "@hypit/temporal/algebra";
import type { LocalTemporalDomain, TemporalRange } from "@hypit/temporal/algebra";
import { sameType, typeKey } from "@hypit/module";

import { audioType } from "./identity.js";
import { assertTemporalControlMapping } from "./control.js";
import { assertAudioOperator } from "./operator.js";
import type { AudioGraph, AudioNode, AudioNodeId, AudioOperator, AudiovisualProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertRange(value: TemporalRange, domain: LocalTemporalDomain, label: string): void {
  assertExactTemporalValue(value.start, `${label}.start`);
  assertExactTemporalValue(value.end, `${label}.end`);
  assert(compareExactTemporalValues(value.start, value.end) < 0, `${label} must be non-empty.`);
  assert(compareExactTemporalValues(value.start,
    { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) >= 0
    && compareExactTemporalValues(value.end, domain.duration) <= 0,
  `${label} lies outside Programme domain ${domain.id}.`);
}

function nodeReferences(node: AudioNode): readonly AudioNodeId[] {
  switch (node.kind) {
    case "silence":
    case "use": return [];
    case "restrict": return [node.input];
    case "mix": return node.inputs;
    case "apply": return Object.values(node.inputs);
  }
}

function assertUse(
  id: string,
  node: Extract<AudioNode, { readonly kind: "use" }>,
  program: AudiovisualProgram,
): void {
  const occurrence = Object.hasOwn(program.occurrences, node.occurrence)
    ? program.occurrences[node.occurrence] : undefined;
  assert(occurrence !== undefined, `Audio use ${id} references missing Occurrence ${node.occurrence}.`);
  const output = Object.hasOwn(occurrence.source.outputs, node.output)
    ? occurrence.source.outputs[node.output] : undefined;
  assert(output !== undefined, `Audio use ${id} references missing Source output ${node.output}.`);
  assert(Object.hasOwn(occurrence.selections, node.output),
    `Audio use ${id} has no Selection for Source output ${node.output}.`);
  assert(sameType(output.type, audioType),
    `Audio use ${id} received ${typeKey(output.type)}, expected ${typeKey(audioType)}.`);
}

function assertNode(id: AudioNodeId, node: AudioNode, program: AudiovisualProgram): void {
  assertIdentity(id, "Audio node id");
  switch (node.kind) {
    case "silence": return;
    case "use": assertUse(id, node, program); return;
    case "restrict": assertRange(node.range, program.domain, `Audio restrict ${id}`); return;
    case "mix":
      assert(node.inputs.length > 0, `Audio mix ${id} must have at least one input.`);
      return;
    case "apply": {
      assertAudioOperator(node.operator, `Audio apply ${id} operator`);
      const expected = new Set(node.operator.inputs);
      for (const name of Object.keys(node.inputs)) {
        assert(expected.has(name), `Audio apply ${id} supplies unknown input ${name}.`);
      }
      for (const name of expected) {
        assert(Object.hasOwn(node.inputs, name), `Audio apply ${id} is missing input ${name}.`);
      }
      const expectedControls = new Set(Object.keys(node.operator.temporalControls));
      for (const name of Object.keys(node.controlMappings)) {
        assert(expectedControls.has(name), `Audio apply ${id} supplies unknown temporal Control ${name}.`);
      }
      for (const name of expectedControls) {
        assert(Object.hasOwn(node.controlMappings, name),
          `Audio apply ${id} is missing temporal Control Mapping ${name}.`);
        assertTemporalControlMapping(
          node.operator.temporalControls[name]!,
          node.controlMappings[name]!,
          program.domain,
        );
      }
    }
  }
}

export function assertAudioGraph(value: AudioGraph, program: AudiovisualProgram): void {
  assertIdentity(value.root, "AudioGraph.root");
  assert(Object.hasOwn(value.nodes, value.root), `Programme ${program.id} has no Audio root node ${value.root}.`);
  const entries = Object.entries(value.nodes);
  assert(entries.length > 0, `Programme ${program.id} has no Audio nodes.`);
  for (const [id, node] of entries) assertNode(id, node, program);

  const visiting = new Set<AudioNodeId>();
  const visited = new Set<AudioNodeId>();
  const visit = (id: AudioNodeId): void => {
    assert(Object.hasOwn(value.nodes, id), `Programme ${program.id} Audio graph references missing node ${id}.`);
    assert(!visiting.has(id), `Programme ${program.id} Audio graph contains a cycle through node ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const reference of nodeReferences(value.nodes[id]!)) visit(reference);
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
