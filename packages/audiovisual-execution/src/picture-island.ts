import {
  pictureNodeSpatialDomains,
  pictureType,
  sealAudiovisualProgram,
  sealOccurrence,
  type AudiovisualProgram,
  type Occurrence,
  type PictureNode,
  type ProgramSource,
} from "@hypit/audiovisual";
import { exactTemporalZero, identityTemporalMap } from "@hypit/temporal/algebra";

import type { AudiovisualIslandExecutionRequest } from "./types.js";

export type AudiovisualPictureIslandInput = {
  readonly product: string;
  /** Programme Source contract through which the island observes this Product. */
  readonly source: string;
  readonly output: string;
};

export type AudiovisualPictureIslandProjection = {
  readonly program: AudiovisualProgram;
  readonly inputs: readonly AudiovisualPictureIslandInput[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function references(node: PictureNode): readonly string[] {
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

function uniqueIdentity(prefix: string, used: ReadonlySet<string>): string {
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

/**
 * Project one selected Picture island back into a closed AVIR Programme.
 *
 * Cross-island graph inputs become transient typed Sources. Source-task inputs
 * retain their authored Source contracts. Neither form is persisted or made a
 * Media Asset; the returned input table lets a Terminal bind each execution
 * Product to the corresponding Source implementation.
 */
export function projectAudiovisualPictureIsland(
  program: AudiovisualProgram,
  request: AudiovisualIslandExecutionRequest,
  rootExecutionNode: string,
): AudiovisualPictureIslandProjection {
  assert(program.picture !== undefined && program.pictureDomain !== undefined,
    `Audiovisual Programme ${program.id} has no Picture graph.`);
  assert(request.island.signals.length === 1 && request.island.signals[0] === "picture",
    `Execution island ${request.island.id} is not a Picture island.`);
  const rootDemand = request.nodes.find((node) => node.id === rootExecutionNode);
  assert(rootDemand !== undefined && rootDemand.signal === "picture",
    `Picture island ${request.island.id} does not own root ${rootExecutionNode}.`);

  const graph = program.picture;
  const domains = pictureNodeSpatialDomains(graph, program);
  const owned = new Set(request.nodes.filter((node) => node.signal === "picture")
    .map((node) => node.node));
  const graphInputs = new Map(request.inputs
    .filter((input) => input.requirement.signal === "picture"
      && input.requirement.target === "node")
    .map((input) => [input.requirement.node.slice("picture:".length), input] as const));
  const sourceInputs = new Map(request.inputs
    .filter((input) => input.requirement.signal === "picture"
      && input.requirement.target === "source")
    .map((input) => [input.requirement.node, input] as const));
  assert(graphInputs.size + sourceInputs.size === request.inputs.length,
    `Picture island ${request.island.id} received an unsupported Product input.`);

  const nodes: Record<string, PictureNode> = {};
  const occurrences = new Map<string, Occurrence>();
  const selectedOutputs = new Map<string, Set<string>>();
  const inputs: AudiovisualPictureIslandInput[] = [];
  const consumed = new Set<string>();
  const usedSources = new Set(Object.keys(program.occurrences).flatMap((id) => [
    id,
    program.occurrences[id]!.source.id,
  ]));

  const available = (node: string): boolean => owned.has(node) || graphInputs.has(node);
  const projectNode = (node: PictureNode): PictureNode => {
    switch (node.kind) {
      case "restrict":
      case "crop":
      case "remap":
      case "remap-control":
        return available(node.input) ? structuredClone(node) : { kind: "transparent" };
      case "over": {
        const inputs = node.inputs.filter(available);
        return inputs.length === 0 ? { kind: "transparent" } : { ...structuredClone(node), inputs };
      }
      default: return structuredClone(node);
    }
  };

  const bindGraphInput = (node: string): void => {
    const input = graphInputs.get(node);
    assert(input !== undefined,
      `Picture island ${request.island.id} crosses unbound node picture:${node}.`);
    const sourceId = uniqueIdentity("island-picture-source", usedSources);
    usedSources.add(sourceId);
    const occurrenceId = uniqueIdentity("island-picture-use", usedSources);
    usedSources.add(occurrenceId);
    const domain = domains.get(node)!;
    const source: ProgramSource = { id: sourceId, outputs: { picture: {
      kind: "signal",
      type: pictureType,
      domain: structuredClone(program.domain),
      spatialDomain: structuredClone(domain),
    } } };
    const occurrence = sealOccurrence({
      id: occurrenceId,
      source,
      domain: structuredClone(program.domain),
      placement: {
        parent: structuredClone(program.domain),
        start: exactTemporalZero(),
        active: { start: exactTemporalZero(), end: structuredClone(program.domain.duration) },
      },
      selections: { picture: {
        kind: "signal",
        mapping: identityTemporalMap(program.domain),
      } },
    });
    occurrences.set(occurrence.id, occurrence);
    nodes[node] = { kind: "use", occurrence: occurrence.id, output: "picture" };
    inputs.push({ product: input.requirement.id, source: source.id, output: "picture" });
    consumed.add(input.requirement.id);
  };

  const visit = (node: string): void => {
    if (Object.hasOwn(nodes, node)) return;
    if (!owned.has(node)) {
      bindGraphInput(node);
      return;
    }
    const authored = graph.nodes[node];
    assert(authored !== undefined, `Picture island references missing graph node ${node}.`);
    const value = projectNode(authored);
    nodes[node] = value;
    if (value.kind === "use") {
      const occurrence = program.occurrences[value.occurrence]!;
      occurrences.set(occurrence.id, occurrence);
      const outputs = selectedOutputs.get(occurrence.id) ?? new Set<string>();
      outputs.add(value.output);
      selectedOutputs.set(occurrence.id, outputs);
      const use = request.uses.find((candidate) => candidate.node === `picture:${node}`);
      assert(use !== undefined, `Picture island use ${node} has no execution use.`);
      const sourceInput = sourceInputs.get(use.producer);
      if (sourceInput !== undefined && !consumed.has(sourceInput.requirement.id)) {
        inputs.push({
          product: sourceInput.requirement.id,
          source: occurrence.source.id,
          output: value.output,
        });
        consumed.add(sourceInput.requirement.id);
      }
    }
    for (const dependency of references(value)) visit(dependency);
  };
  visit(rootDemand.node);

  const closedOccurrences = Object.fromEntries([...occurrences].map(([id, occurrence]) => {
    const outputs = selectedOutputs.get(id);
    if (outputs === undefined) return [id, structuredClone(occurrence)] as const;
    return [id, {
      ...structuredClone(occurrence),
      selections: Object.fromEntries(Object.entries(occurrence.selections)
        .filter(([output]) => outputs.has(output))),
    }] as const;
  }));
  const projected = sealAudiovisualProgram({
    id: program.id,
    domain: structuredClone(program.domain),
    pictureDomain: structuredClone(domains.get(rootDemand.node)!),
    occurrences: closedOccurrences,
    picture: { root: rootDemand.node, nodes },
  });
  return { program: projected, inputs };
}
