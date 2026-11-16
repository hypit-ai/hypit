import {
  assertExactTemporalValue,
  assertTemporalControlMapping,
  compareExactTemporalValues,
  exactTemporalZero,
  type LocalTemporalDomain,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { assertSpatialMapControl, spatialMapControlDomains } from "./control.js";
import { assertIdentity } from "./implementation.js";
import { assertPictureOperator } from "./operator.js";
import {
  assertSpatialMap,
  assertSpatialRegion,
  sameSpatialDomain,
  type LocalSpatialDomain,
  type SpatialRegion,
} from "./spatial.js";
import type { AudiovisualProgram, PictureGraph, PictureNode, PictureNodeId } from "./types.js";

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

function references(node: PictureNode): readonly string[] {
  switch (node.kind) {
    case "transparent": case "use": return [];
    case "restrict": case "crop": case "remap": case "remap-control": return [node.input];
    case "over": return node.inputs;
    case "apply": return Object.values(node.inputs);
  }
}

function assertNode(id: string, node: PictureNode, program: AudiovisualProgram): void {
  assertIdentity(id, "Picture node id");
  switch (node.kind) {
    case "transparent": return;
    case "use": {
      const occurrence = program.occurrences[node.occurrence];
      assert(occurrence !== undefined, `Picture use ${id} references missing Occurrence ${node.occurrence}.`);
      const output = occurrence.source.outputs[node.output];
      assert(output !== undefined, `Picture use ${id} references missing Source output ${node.output}.`);
      assert(occurrence.selections[node.output] !== undefined,
        `Picture use ${id} has no Selection for Source output ${node.output}.`);
      assert(output.signal === "picture", `Picture use ${id} received ${output.signal}, expected picture.`);
      return;
    }
    case "restrict": assertRange(node.range, program.domain, `Picture restrict ${id}`); return;
    case "crop": assertSpatialRegion(node.region, `Picture crop ${id}`); return;
    case "remap": assertSpatialMap(node.mapping); return;
    case "remap-control":
      assertSpatialMapControl(node.control);
      assertTemporalControlMapping(node.control.domain, node.controlMapping, program.domain);
      return;
    case "over": assert(node.inputs.length > 0, `Picture over ${id} has no inputs.`); return;
    case "apply": {
      assertPictureOperator(node.operator, `Picture apply ${id} operator`);
      const expected = new Set(node.operator.inputs);
      for (const name of Object.keys(node.inputs)) assert(expected.has(name), `Picture apply ${id} has unknown input ${name}.`);
      for (const name of expected) assert(node.inputs[name] !== undefined, `Picture apply ${id} is missing input ${name}.`);
      const controls = new Set(Object.keys(node.operator.temporalControls));
      for (const name of Object.keys(node.controlMappings)) {
        assert(controls.has(name), `Picture apply ${id} has unknown Control ${name}.`);
      }
      for (const name of controls) {
        const mapping = node.controlMappings[name];
        assert(mapping !== undefined, `Picture apply ${id} is missing Control Mapping ${name}.`);
        assertTemporalControlMapping(node.operator.temporalControls[name]!, mapping, program.domain);
      }
    }
  }
}

function regionInside(region: SpatialRegion, domain: LocalSpatialDomain): boolean {
  return region.x >= domain.region.x && region.y >= domain.region.y
    && region.x + region.width <= domain.region.x + domain.region.width
    && region.y + region.height <= domain.region.y + domain.region.height;
}

function commonDomain(domains: readonly LocalSpatialDomain[], label: string): LocalSpatialDomain {
  const first = domains[0];
  assert(first !== undefined, `${label} has no Picture inputs.`);
  for (const domain of domains.slice(1)) {
    assert(sameSpatialDomain(first, domain), `${label} mixes spatial domains without a remap.`);
  }
  return first;
}

export function pictureNodeSpatialDomains(
  value: PictureGraph,
  program: AudiovisualProgram,
): ReadonlyMap<PictureNodeId, LocalSpatialDomain> {
  const programmeDomain = program.pictureDomain;
  assert(programmeDomain !== undefined, `Programme ${program.id} Picture has no output spatial domain.`);
  const domains = new Map<string, LocalSpatialDomain>();
  const domainOf = (id: string): LocalSpatialDomain => {
    const cached = domains.get(id);
    if (cached !== undefined) return cached;
    const node = value.nodes[id];
    assert(node !== undefined, `Programme ${program.id} Picture graph references missing node ${id}.`);
    let domain: LocalSpatialDomain;
    switch (node.kind) {
      case "transparent": domain = programmeDomain; break;
      case "use": domain = (program.occurrences[node.occurrence]!.source.outputs[node.output] as { spatialDomain: LocalSpatialDomain }).spatialDomain; break;
      case "restrict": domain = domainOf(node.input); break;
      case "crop":
        domain = domainOf(node.input);
        assert(regionInside(node.region, domain), `Picture crop ${id} lies outside spatial domain ${domain.id}.`);
        break;
      case "remap":
        assert(sameSpatialDomain(domainOf(node.input), node.mapping.source), `Picture remap ${id} reads the wrong source domain.`);
        domain = node.mapping.target;
        break;
      case "remap-control": {
        const controlled = spatialMapControlDomains(node.control);
        assert(sameSpatialDomain(domainOf(node.input), controlled.source), `Picture remap Control ${id} reads the wrong source domain.`);
        domain = controlled.target;
        break;
      }
      case "over": domain = commonDomain(node.inputs.map(domainOf), `Picture over ${id}`); break;
      case "apply": domain = commonDomain(Object.values(node.inputs).map(domainOf), `Picture apply ${id}`); break;
    }
    domains.set(id, domain);
    return domain;
  };
  for (const id of Object.keys(value.nodes)) domainOf(id);
  return domains;
}

export function assertPictureGraph(value: PictureGraph, program: AudiovisualProgram): void {
  assertIdentity(value.root, "PictureGraph.root");
  assert(value.nodes[value.root] !== undefined, `Programme ${program.id} has no Picture root node ${value.root}.`);
  const entries = Object.entries(value.nodes);
  assert(entries.length > 0, `Programme ${program.id} has no Picture nodes.`);
  for (const [id, node] of entries) assertNode(id, node, program);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    const node = value.nodes[id];
    assert(node !== undefined, `Programme ${program.id} Picture graph references missing node ${id}.`);
    assert(!visiting.has(id), `Programme ${program.id} Picture graph contains a cycle through node ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const reference of references(node)) visit(reference);
    visiting.delete(id);
    visited.add(id);
  };
  visit(value.root);
  assert(visited.size === entries.length, `Programme ${program.id} Picture graph contains unreachable nodes.`);
  const root = pictureNodeSpatialDomains(value, program).get(value.root)!;
  assert(sameSpatialDomain(root, program.pictureDomain!),
    `Programme ${program.id} Picture root closes in ${root.id}, not ${program.pictureDomain!.id}.`);
}

export function pictureGraphUses(value: PictureGraph): readonly { readonly occurrence: string; readonly output: string }[] {
  return Object.values(value.nodes).flatMap((node) => node.kind === "use"
    ? [{ occurrence: node.occurrence, output: node.output }] : []);
}
