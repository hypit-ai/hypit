import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  type LocalTemporalDomain,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { assertIdentity } from "@hypit/nle";
import {
  assertSpatialMap,
  assertSpatialRegion,
  sameSpatialDomain,
  type LocalSpatialDomain,
  type SpatialRegion,
} from "./spatial.js";
import type { CompilationGraph, PictureGraph, PictureNode, PictureNodeId } from "./types.js";

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

export function pictureInputs(node: PictureNode): readonly string[] {
  switch (node.kind) {
    case "transparent": case "use": return [];
    case "restrict": case "crop": case "remap": return [node.input];
    case "over": return node.inputs;
    case "alpha-mask": return [node.content, node.matte];
    case "apply": return Object.values(node.inputs);
  }
}

function assertNode(id: string, node: PictureNode, program: CompilationGraph): void {
  assertIdentity(id, "Picture node id");
  switch (node.kind) {
    case "transparent": assertSpatialRegion(node.spatialDomain.region, `Picture ${id} domain`); return;
    case "use": {
      const occurrence = program.occurrences[node.occurrence];
      assert(occurrence?.picture !== undefined, `Picture use ${id} requires a Picture read on ${node.occurrence}.`);
      return;
    }
    case "restrict": assertRange(node.range, program.domain, `Picture restrict ${id}`); return;
    case "crop": assertSpatialRegion(node.region, `Picture crop ${id}`); return;
    case "remap": assertSpatialMap(node.mapping); return;

    case "over": assert(node.inputs.length > 0, `Picture over ${id} has no inputs.`); return;
    case "alpha-mask": return;
    case "apply": assert(Object.keys(node.inputs).length > 0, `Picture apply ${id} has no inputs.`); return;
  }
}

function regionInside(region: SpatialRegion, domain: LocalSpatialDomain): boolean {
  const x = region.x - domain.region.x;
  const y = region.y - domain.region.y;
  return x >= 0 && y >= 0 && region.width <= domain.region.width - x && region.height <= domain.region.height - y;
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
  program: CompilationGraph,
): ReadonlyMap<PictureNodeId, LocalSpatialDomain> {
  const domains = new Map<string, LocalSpatialDomain>();
  const domainOf = (id: string): LocalSpatialDomain => {
    const cached = domains.get(id);
    if (cached !== undefined) return cached;
    const node = value.nodes[id];
    assert(node !== undefined, `Programme ${program.id} Picture graph references missing node ${id}.`);
    let domain: LocalSpatialDomain;
    switch (node.kind) {
      case "transparent": domain = node.spatialDomain; break;
      case "use": domain = program.occurrences[node.occurrence]!.picture!.spatialDomain; break;
      case "restrict": domain = domainOf(node.input); break;
      case "crop":
        domain = domainOf(node.input);
        assert(regionInside(node.region, domain), `Picture crop ${id} lies outside spatial domain ${domain.id}.`);
        break;
      case "remap":
        assert(sameSpatialDomain(domainOf(node.input), node.mapping.source), `Picture remap ${id} reads the wrong source domain.`);
        domain = node.mapping.target;
        break;
      case "over": domain = commonDomain(node.inputs.map(domainOf), `Picture over ${id}`); break;
      case "alpha-mask": domain = commonDomain([domainOf(node.content), domainOf(node.matte)], `Picture alpha mask ${id}`); break;
      case "apply": domain = commonDomain(Object.values(node.inputs).map(domainOf), `Picture apply ${id}`); break;
    }
    domains.set(id, domain);
    return domain;
  };
  domainOf(value.root);
  return domains;
}

export function assertPictureGraph(value: PictureGraph, program: CompilationGraph): void {
  assertIdentity(value.root, "PictureGraph.root");
  assert(value.nodes[value.root] !== undefined, `Programme ${program.id} has no Picture root node ${value.root}.`);
  const entries = Object.entries(value.nodes);
  assert(entries.length > 0, `Programme ${program.id} has no Picture nodes.`);
  for (const [id, node] of entries) assertNode(id, node, program);
  const root = pictureNodeSpatialDomains(value, program).get(value.root)!;
  assert(sameSpatialDomain(root, program.pictureDomain!),
    `Programme ${program.id} Picture root closes in ${root.id}, not ${program.pictureDomain!.id}.`);
}

export function pictureGraphUses(value: PictureGraph): Set<string> {
  return new Set(Object.values(value.nodes).flatMap(node => node.kind === "use" ? [node.occurrence] : []));
}
