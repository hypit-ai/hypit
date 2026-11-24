import { assertLocalTemporalDomain, compareExactTemporalValues } from "@hypit/temporal/algebra";
import { assertAudioGraph, audioGraphUses, audioInputs } from "./audio.js";
import { assertIdentity } from "@hypit/nle";
import { assertOccurrence } from "./occurrence.js";
import { assertPictureGraph, pictureGraphUses, pictureInputs } from "./picture.js";
import { assertLocalSpatialDomain } from "./spatial.js";
import type { CompilationGraph } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameDomain(left: CompilationGraph["domain"], right: CompilationGraph["domain"]): boolean {
  return left.id === right.id && compareExactTemporalValues(left.duration, right.duration) === 0;
}

function assertCompilationGraph(value: CompilationGraph): void {
  assertIdentity(value.id, "CompilationGraph.id");
  assertLocalTemporalDomain(value.domain);
  assert(value.picture !== undefined || value.audio !== undefined, `Programme ${value.id} has no outputs.`);
  if (value.picture === undefined) {
    assert(value.pictureDomain === undefined, `Audio-only Programme ${value.id} contains an unused Picture domain.`);
  } else {
    assert(value.pictureDomain !== undefined, `Programme ${value.id} Picture has no output spatial domain.`);
    assertLocalSpatialDomain(value.pictureDomain);
  }
  for (const [id, occurrence] of Object.entries(value.occurrences)) {
    assertIdentity(id, "Programme Occurrence id");
    assert(id === occurrence.id, `Occurrence key ${id} does not match identity ${occurrence.id}.`);
    assertOccurrence(occurrence);
    assert(sameDomain(occurrence.placement.parent, value.domain),
      `Occurrence ${id} belongs to parent domain ${occurrence.placement.parent.id}, not ${value.domain.id}.`);
  }
  if (value.picture !== undefined) assertPictureGraph(value.picture, value);
  if (value.audio !== undefined) assertAudioGraph(value.audio, value);
}

function reachableGraph<Node>(
  graph: { readonly root: string; readonly nodes: Readonly<Record<string, Node>> },
  inputs: (node: Node) => readonly string[],
  label: string,
): { readonly root: string; readonly nodes: Readonly<Record<string, Node>> } {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    assert(!visiting.has(id), `${label} contains a cycle through ${id}.`);
    if (visited.has(id)) return;
    const node = graph.nodes[id];
    assert(node !== undefined, `${label} references missing node ${id}.`);
    visiting.add(id);
    for (const input of inputs(node)) visit(input);
    visiting.delete(id);
    visited.add(id);
  };
  visit(graph.root);
  return { root: graph.root, nodes: Object.fromEntries(Object.entries(graph.nodes).filter(([id]) => visited.has(id))) };
}

export function sealCompilationGraph(value: CompilationGraph): CompilationGraph {
  const picture = value.picture === undefined ? undefined
    : { ...value.picture, ...reachableGraph(value.picture, pictureInputs, `Programme ${value.id} Picture`) };
  const audio = value.audio === undefined ? undefined
    : reachableGraph(value.audio, audioInputs, `Programme ${value.id} Audio`);
  const pictureUses = picture === undefined ? new Set<string>() : pictureGraphUses(picture);
  const audioUses = audio === undefined ? new Set<string>() : audioGraphUses(audio);
  const occurrences = Object.fromEntries(Object.entries(value.occurrences).flatMap(([id, occurrence]) => {
    const pictureRead = pictureUses.has(id) ? occurrence.picture : undefined;
    const audioRead = audioUses.has(id) ? occurrence.audio : undefined;
    if (pictureRead === undefined && audioRead === undefined) return [];
    return [[id, {
      id: occurrence.id, content: occurrence.content, domain: occurrence.domain, placement: occurrence.placement,
      ...(pictureRead === undefined ? {} : { picture: pictureRead }),
      ...(audioRead === undefined ? {} : { audio: audioRead }),
    }]];
  }));
  const programme = {
    ...value,
    ...(picture === undefined ? {} : { picture }),
    ...(audio === undefined ? {} : { audio }),
    occurrences,
  };
  assertCompilationGraph(programme);
  return structuredClone(programme);
}
