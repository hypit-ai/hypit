import { assertExactTemporalValue, compareExactTemporalValues } from "@hypit/temporal/algebra";
import type { LocalTemporalDomain, TemporalRange } from "@hypit/temporal/algebra";
import { sameType, typeKey } from "@hypit/module";
import {
  assertSpatialMap,
  assertSpatialRegion,
  sameSpatialDomain,
  type LocalSpatialDomain,
  type SpatialRegion,
} from "@hypit/spatial/algebra";

import { pictureType } from "./identity.js";
import {
  assertSpatialMapControl,
  assertTemporalControlMapping,
  spatialMapControlDomains,
} from "./control.js";
import { assertPictureOperator } from "./operator.js";
import type { AudiovisualProgram, PictureGraph, PictureNode, PictureNodeId, PictureOperator } from "./types.js";

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

function nodeReferences(node: PictureNode): readonly PictureNodeId[] {
  switch (node.kind) {
    case "transparent":
    case "use": return [];
    case "restrict":
    case "crop":
    case "remap":
    case "remap-control": return [node.input];
    case "over": return node.inputs;
    case "apply": return Object.values(node.inputs);
  }
}

function assertUse(
  id: string,
  node: Extract<PictureNode, { readonly kind: "use" }>,
  program: AudiovisualProgram,
): void {
  const occurrence = Object.hasOwn(program.occurrences, node.occurrence)
    ? program.occurrences[node.occurrence] : undefined;
  assert(occurrence !== undefined, `Picture use ${id} references missing Occurrence ${node.occurrence}.`);
  const output = Object.hasOwn(occurrence.source.outputs, node.output)
    ? occurrence.source.outputs[node.output] : undefined;
  assert(output !== undefined, `Picture use ${id} references missing Source output ${node.output}.`);
  assert(Object.hasOwn(occurrence.selections, node.output),
    `Picture use ${id} has no Selection for Source output ${node.output}.`);
  assert(sameType(output.type, pictureType),
    `Picture use ${id} received ${typeKey(output.type)}, expected ${typeKey(pictureType)}.`);
  assert(output.spatialDomain !== undefined,
    `Picture use ${id} Source output ${node.output} has no spatial domain.`);
}

function assertNode(id: PictureNodeId, node: PictureNode, program: AudiovisualProgram): void {
  assertIdentity(id, "Picture node id");
  switch (node.kind) {
    case "transparent": return;
    case "use": assertUse(id, node, program); return;
    case "restrict": assertRange(node.range, program.domain, `Picture restrict ${id}`); return;
    case "crop": assertSpatialRegion(node.region, `Picture crop ${id}`); return;
    case "remap": assertSpatialMap(node.mapping); return;
    case "remap-control":
      assertSpatialMapControl(node.control);
      assertTemporalControlMapping(node.control.domain, node.controlMapping, program.domain);
      return;
    case "over":
      assert(node.inputs.length > 0, `Picture over ${id} must have at least one ordered input.`);
      return;
    case "apply": {
      assertPictureOperator(node.operator, `Picture apply ${id} operator`);
      const expected = new Set(node.operator.inputs);
      for (const name of Object.keys(node.inputs)) {
        assert(expected.has(name), `Picture apply ${id} supplies unknown input ${name}.`);
      }
      for (const name of expected) {
        assert(Object.hasOwn(node.inputs, name), `Picture apply ${id} is missing input ${name}.`);
      }
      const expectedControls = new Set(Object.keys(node.operator.temporalControls));
      for (const name of Object.keys(node.controlMappings)) {
        assert(expectedControls.has(name), `Picture apply ${id} supplies unknown temporal Control ${name}.`);
      }
      for (const name of expectedControls) {
        assert(Object.hasOwn(node.controlMappings, name),
          `Picture apply ${id} is missing temporal Control Mapping ${name}.`);
        assertTemporalControlMapping(
          node.operator.temporalControls[name]!,
          node.controlMappings[name]!,
          program.domain,
        );
      }
    }
  }
}

function regionInside(region: SpatialRegion, domain: LocalSpatialDomain): boolean {
  return region.x >= domain.region.x
    && region.y >= domain.region.y
    && region.x + region.width <= domain.region.x + domain.region.width
    && region.y + region.height <= domain.region.y + domain.region.height;
}

function assertCommonDomain(
  domains: readonly LocalSpatialDomain[],
  label: string,
): LocalSpatialDomain {
  const [first, ...rest] = domains;
  assert(first !== undefined, `${label} has no Picture inputs.`);
  for (const domain of rest) {
    assert(sameSpatialDomain(first, domain),
      `${label} mixes spatial domains ${first.id} and ${domain.id} without a remap.`);
  }
  return first;
}

export function assertPictureGraph(value: PictureGraph, program: AudiovisualProgram): void {
  assertIdentity(value.root, "PictureGraph.root");
  assert(Object.hasOwn(value.nodes, value.root), `Programme ${program.id} has no Picture root node ${value.root}.`);
  const entries = Object.entries(value.nodes);
  assert(entries.length > 0, `Programme ${program.id} has no Picture nodes.`);
  for (const [id, node] of entries) assertNode(id, node, program);

  const visiting = new Set<PictureNodeId>();
  const visited = new Set<PictureNodeId>();
  const visit = (id: PictureNodeId): void => {
    assert(Object.hasOwn(value.nodes, id), `Programme ${program.id} Picture graph references missing node ${id}.`);
    assert(!visiting.has(id), `Programme ${program.id} Picture graph contains a cycle through node ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const reference of nodeReferences(value.nodes[id]!)) visit(reference);
    visiting.delete(id);
    visited.add(id);
  };
  visit(value.root);
  assert(visited.size === entries.length, `Programme ${program.id} Picture graph contains unreachable nodes.`);

  const domains = pictureNodeSpatialDomains(value, program);
  const programmeDomain = program.pictureDomain!;
  const rootDomain = domains.get(value.root)!;
  assert(sameSpatialDomain(rootDomain, programmeDomain),
    `Programme ${program.id} Picture root closes in ${rootDomain.id}, not ${programmeDomain.id}.`);
}

/** Resolve the exact spatial domain carried by every Picture graph node. */
export function pictureNodeSpatialDomains(
  value: PictureGraph,
  program: AudiovisualProgram,
): ReadonlyMap<PictureNodeId, LocalSpatialDomain> {
  const programmeDomain = program.pictureDomain;
  assert(programmeDomain !== undefined, `Audiovisual Programme ${program.id} Picture has no output spatial domain.`);
  const domains = new Map<PictureNodeId, LocalSpatialDomain>();
  const domainOf = (id: PictureNodeId): LocalSpatialDomain => {
    const cached = domains.get(id);
    if (cached !== undefined) return cached;
    const node = value.nodes[id]!;
    let domain: LocalSpatialDomain;
    switch (node.kind) {
      case "transparent": domain = programmeDomain; break;
      case "use": {
        const occurrence = program.occurrences[node.occurrence]!;
        domain = occurrence.source.outputs[node.output]!.spatialDomain!;
        break;
      }
      case "restrict": domain = domainOf(node.input); break;
      case "crop": {
        domain = domainOf(node.input);
        assert(regionInside(node.region, domain),
          `Picture crop ${id} lies outside spatial domain ${domain.id}.`);
        break;
      }
      case "remap": {
        const input = domainOf(node.input);
        assert(sameSpatialDomain(input, node.mapping.source),
          `Picture remap ${id} reads ${input.id}, not Mapping source ${node.mapping.source.id}.`);
        domain = node.mapping.target;
        break;
      }
      case "remap-control": {
        const input = domainOf(node.input);
        const controlled = spatialMapControlDomains(node.control);
        assert(sameSpatialDomain(input, controlled.source),
          `Picture remap Control ${id} reads ${input.id}, not Control source ${controlled.source.id}.`);
        domain = controlled.target;
        break;
      }
      case "over": domain = assertCommonDomain(node.inputs.map(domainOf), `Picture over ${id}`); break;
      case "apply": domain = assertCommonDomain(Object.values(node.inputs).map(domainOf), `Picture apply ${id}`); break;
    }
    domains.set(id, domain);
    return domain;
  };
  for (const id of Object.keys(value.nodes)) domainOf(id);
  return domains;
}

export function pictureGraphUses(value: PictureGraph): readonly { readonly occurrence: string; readonly output: string }[] {
  return Object.values(value.nodes).flatMap((node) => node.kind === "use"
    ? [{ occurrence: node.occurrence, output: node.output }] : []);
}
