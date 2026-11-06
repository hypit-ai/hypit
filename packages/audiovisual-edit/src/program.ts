import {
  assertAudiovisualProgram,
  occurrenceParentRange,
  sealAudiovisualProgram,
  sealOccurrence,
  type AudioGraph,
  type AudiovisualProgram,
  type Occurrence,
  type OccurrenceOutputSelection,
  type PictureGraph,
  type TemporalControlBinding,
} from "@hypit/audiovisual";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalMap,
  type TemporalRange,
} from "@hypit/temporal/algebra";

import { moveOccurrence, remapOccurrence, splitOccurrence, trimOccurrence } from "./occurrence.js";
import type {
  RippleTrimProgramOccurrenceOptions,
  RollProgramOccurrencesOptions,
  SplitAudioGraphPlan,
  SplitPictureGraphPlan,
  SplitProgramOccurrenceOptions,
  SplitUseNodeIds,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function replaceOccurrence(value: AudiovisualProgram, id: string,
  edit: (occurrence: Occurrence) => Occurrence): AudiovisualProgram {
  assertAudiovisualProgram(value);
  assertIdentity(id, "Audiovisual Programme Occurrence edit id");
  const occurrence = Object.hasOwn(value.occurrences, id) ? value.occurrences[id] : undefined;
  assert(occurrence !== undefined, `Audiovisual Programme ${value.id} has no Occurrence ${id}.`);
  const replacement = edit(occurrence);
  assert(replacement.id === id, `Occurrence edit changed identity ${id} to ${replacement.id}.`);
  return sealAudiovisualProgram({ ...structuredClone(value),
    occurrences: { ...structuredClone(value.occurrences), [id]: replacement } });
}

export function moveProgramOccurrence(value: AudiovisualProgram, id: string,
  start: ExactTemporalValue): AudiovisualProgram {
  return replaceOccurrence(value, id, occurrence => moveOccurrence(occurrence, start));
}

export function trimProgramOccurrence(value: AudiovisualProgram, id: string,
  active: TemporalRange): AudiovisualProgram {
  return replaceOccurrence(value, id, occurrence => trimOccurrence(occurrence, active));
}

export function remapProgramOccurrence(value: AudiovisualProgram, id: string,
  output: string, mapping: TemporalMap): AudiovisualProgram {
  return replaceOccurrence(value, id, occurrence => remapOccurrence(occurrence, output, mapping));
}

export function slipProgramOccurrence(value: AudiovisualProgram, id: string,
  mappings: Readonly<Record<string, TemporalMap>>): AudiovisualProgram {
  assert(Object.keys(mappings).length > 0, "Occurrence slip must replace at least one output Mapping.");
  return replaceOccurrence(value, id, occurrence => {
    const next: Record<string, OccurrenceOutputSelection> = structuredClone(occurrence.selections);
    for (const [output, mapping] of Object.entries(mappings)) {
      assertIdentity(output, "Occurrence slip output");
      const selection = next[output];
      assert(selection !== undefined, `Occurrence ${occurrence.id} does not select Source output ${output}.`);
      assert(selection.kind === "signal", `Occurrence ${occurrence.id}.${output} is constant and cannot be slipped.`);
      next[output] = { ...structuredClone(selection), mapping: structuredClone(mapping) };
    }
    return sealOccurrence({ ...structuredClone(occurrence), selections: next });
  });
}

function occurrenceOf(value: AudiovisualProgram, id: string, label: string): Occurrence {
  assertIdentity(id, label);
  const occurrence = Object.hasOwn(value.occurrences, id) ? value.occurrences[id] : undefined;
  assert(occurrence !== undefined, `Audiovisual Programme ${value.id} has no Occurrence ${id}.`);
  return occurrence;
}

export function rollProgramOccurrences(value: AudiovisualProgram,
  options: RollProgramOccurrencesOptions): AudiovisualProgram {
  assertAudiovisualProgram(value);
  assert(options.left !== options.right, "Roll Occurrences must be distinct.");
  assertExactTemporalValue(options.at, "Roll boundary");
  const left = occurrenceOf(value, options.left, "Roll left Occurrence id");
  const right = occurrenceOf(value, options.right, "Roll right Occurrence id");
  const leftRange = occurrenceParentRange(left);
  const rightRange = occurrenceParentRange(right);
  assert(compareExactTemporalValues(leftRange.end, rightRange.start) === 0,
    `Roll Occurrences ${left.id} and ${right.id} do not share a parent boundary.`);
  const delta = subtractExactTemporalValues(options.at, leftRange.end);
  const rolledLeft = trimOccurrence(left, { start: left.placement.active.start,
    end: addExactTemporalValues(left.placement.active.end, delta) });
  const rolledRight = trimOccurrence(right, { start: addExactTemporalValues(right.placement.active.start, delta),
    end: right.placement.active.end });
  return sealAudiovisualProgram({ ...structuredClone(value), occurrences: {
    ...structuredClone(value.occurrences), [left.id]: rolledLeft, [right.id]: rolledRight,
  } });
}

export function rippleTrimProgramOccurrence(value: AudiovisualProgram, id: string,
  options: RippleTrimProgramOccurrenceOptions): AudiovisualProgram {
  assertAudiovisualProgram(value);
  assert(options.boundary === "start" || options.boundary === "end", "Ripple boundary must be start or end.");
  assert(Array.isArray(options.scope), "Ripple scope must be an explicit Occurrence list.");
  const target = occurrenceOf(value, id, "Ripple target Occurrence id");
  const scope = new Set<string>();
  for (const occurrenceId of options.scope) {
    assertIdentity(occurrenceId, "Ripple scope Occurrence id");
    assert(occurrenceId !== id, "Ripple scope cannot contain its target Occurrence.");
    assert(!scope.has(occurrenceId), `Ripple scope repeats Occurrence ${occurrenceId}.`);
    occurrenceOf(value, occurrenceId, "Ripple scope Occurrence id");
    scope.add(occurrenceId);
  }
  const before = occurrenceParentRange(target);
  const trimmed = trimOccurrence(target, options.active);
  const after = occurrenceParentRange(trimmed);
  const delta = subtractExactTemporalValues(options.boundary === "start" ? after.start : after.end,
    options.boundary === "start" ? before.start : before.end);
  const occurrences = structuredClone(value.occurrences) as Record<string, Occurrence>;
  occurrences[id] = trimmed;
  for (const occurrenceId of scope) {
    const occurrence = occurrences[occurrenceId]!;
    occurrences[occurrenceId] = moveOccurrence(occurrence,
      addExactTemporalValues(occurrence.placement.start, delta));
  }
  return sealAudiovisualProgram({ ...structuredClone(value), occurrences });
}

function assertSplitUseIds(graph: "Picture" | "Audio", originalNode: string, ids: SplitUseNodeIds,
  existing: Readonly<Record<string, unknown>>, allocated: Set<string>): void {
  assertIdentity(ids.left, `${graph} split left use node for ${originalNode}`);
  assertIdentity(ids.right, `${graph} split right use node for ${originalNode}`);
  assert(ids.left !== ids.right, `${graph} split use nodes for ${originalNode} must be distinct.`);
  for (const id of [ids.left, ids.right]) {
    assert(!Object.hasOwn(existing, id), `${graph} split use node ${id} already exists.`);
    assert(!allocated.has(id), `${graph} split use node ${id} is allocated more than once.`);
    allocated.add(id);
  }
}

function bindingReferencesOccurrence(binding: TemporalControlBinding, occurrence: string): boolean {
  return (binding.kind === "occurrence" || binding.kind === "source")
    && binding.occurrence === occurrence;
}

function pictureOccurrenceReferences(graph: PictureGraph, occurrence: string): readonly string[] {
  const references: string[] = [];
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.kind === "use" && node.occurrence === occurrence) references.push(`use ${id}`);
    if (node.kind === "remap-control" && bindingReferencesOccurrence(node.binding, occurrence)) {
      references.push(`Control binding ${id}`);
    }
    if (node.kind === "apply") {
      for (const [name, binding] of Object.entries(node.controlBindings)) {
        if (bindingReferencesOccurrence(binding, occurrence)) references.push(`Control binding ${id}.${name}`);
      }
    }
  }
  return references;
}

function audioOccurrenceReferences(graph: AudioGraph, occurrence: string): readonly string[] {
  const references: string[] = [];
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.kind === "use" && node.occurrence === occurrence) references.push(`use ${id}`);
    if (node.kind === "apply") {
      for (const [name, binding] of Object.entries(node.controlBindings)) {
        if (bindingReferencesOccurrence(binding, occurrence)) references.push(`Control binding ${id}.${name}`);
      }
    }
  }
  return references;
}

function assertNoControlledPictureReference(graph: PictureGraph, occurrence: string): void {
  const reference = pictureOccurrenceReferences(graph, occurrence)
    .find((item) => item.startsWith("Control binding "));
  assert(reference === undefined,
    `Picture ${reference ?? "Control binding"} references split Occurrence ${occurrence}; supply an explicit replacement graph.`);
}

function assertNoControlledAudioReference(graph: AudioGraph, occurrence: string): void {
  const reference = audioOccurrenceReferences(graph, occurrence)
    .find((item) => item.startsWith("Control binding "));
  assert(reference === undefined,
    `Audio ${reference ?? "Control binding"} references split Occurrence ${occurrence}; supply an explicit replacement graph.`);
}

function assertReplacementRemovedOccurrence(
  graph: "Picture" | "Audio",
  occurrence: string,
  references: readonly string[],
): void {
  assert(references.length === 0,
    `${graph} replacement still references split Occurrence ${occurrence} at ${references.join(", ")}.`);
}

function splitPictureUses(graph: PictureGraph | undefined, occurrence: string, leftOccurrence: string,
  rightOccurrence: string, supplied: Readonly<Record<string, SplitUseNodeIds>> | undefined): PictureGraph | undefined {
  if (graph === undefined) {
    assert(supplied === undefined || Object.keys(supplied).length === 0,
      "Picture split use ids were supplied for a Programme without Picture.");
    return undefined;
  }
  const affected = Object.entries(graph.nodes).filter(([, node]) => node.kind === "use" && node.occurrence === occurrence);
  const expected = new Set(affected.map(([id]) => id));
  const provided = supplied ?? {};
  for (const id of Object.keys(provided)) assert(expected.has(id), `Picture split specifies unrelated use node ${id}.`);
  for (const id of expected) assert(Object.hasOwn(provided, id), `Picture split is missing use node identities for ${id}.`);
  const nodes = structuredClone(graph.nodes) as Record<string, PictureGraph["nodes"][string]>;
  const allocated = new Set<string>();
  for (const [id, node] of affected) {
    assert(node.kind === "use", "Picture split internal use selection is invalid.");
    const ids = provided[id]!;
    assertSplitUseIds("Picture", id, ids, nodes, allocated);
    nodes[ids.left] = { kind: "use", occurrence: leftOccurrence, output: node.output };
    nodes[ids.right] = { kind: "use", occurrence: rightOccurrence, output: node.output };
    nodes[id] = { kind: "over", inputs: [ids.left, ids.right] };
  }
  return { root: graph.root, nodes };
}

function splitAudioUses(graph: AudioGraph | undefined, occurrence: string, leftOccurrence: string,
  rightOccurrence: string, supplied: Readonly<Record<string, SplitUseNodeIds>> | undefined): AudioGraph | undefined {
  if (graph === undefined) {
    assert(supplied === undefined || Object.keys(supplied).length === 0,
      "Audio split use ids were supplied for a Programme without Audio.");
    return undefined;
  }
  const affected = Object.entries(graph.nodes).filter(([, node]) => node.kind === "use" && node.occurrence === occurrence);
  const expected = new Set(affected.map(([id]) => id));
  const provided = supplied ?? {};
  for (const id of Object.keys(provided)) assert(expected.has(id), `Audio split specifies unrelated use node ${id}.`);
  for (const id of expected) assert(Object.hasOwn(provided, id), `Audio split is missing use node identities for ${id}.`);
  const nodes = structuredClone(graph.nodes) as Record<string, AudioGraph["nodes"][string]>;
  const allocated = new Set<string>();
  for (const [id, node] of affected) {
    assert(node.kind === "use", "Audio split internal use selection is invalid.");
    const ids = provided[id]!;
    assertSplitUseIds("Audio", id, ids, nodes, allocated);
    nodes[ids.left] = { kind: "use", occurrence: leftOccurrence, output: node.output };
    nodes[ids.right] = { kind: "use", occurrence: rightOccurrence, output: node.output };
    nodes[id] = { kind: "mix", inputs: [ids.left, ids.right] };
  }
  return { root: graph.root, nodes };
}

function splitPictureGraph(
  graph: PictureGraph | undefined,
  occurrence: string,
  leftOccurrence: string,
  rightOccurrence: string,
  plan: SplitPictureGraphPlan | undefined,
): PictureGraph | undefined {
  if (graph === undefined) {
    assert(plan === undefined, "Picture split plan was supplied for a Programme without Picture.");
    return undefined;
  }
  const references = pictureOccurrenceReferences(graph, occurrence);
  if (references.length === 0) {
    assert(plan === undefined, `Picture graph does not reference split Occurrence ${occurrence}.`);
    return structuredClone(graph);
  }
  assert(plan !== undefined, `Picture graph references split Occurrence ${occurrence} but has no split plan.`);
  if (plan.kind === "split-uses") {
    assertNoControlledPictureReference(graph, occurrence);
    return splitPictureUses(graph, occurrence, leftOccurrence, rightOccurrence, plan.uses)!;
  }
  const replacement = structuredClone(plan.graph);
  assertReplacementRemovedOccurrence("Picture", occurrence,
    pictureOccurrenceReferences(replacement, occurrence));
  return replacement;
}

function splitAudioGraph(
  graph: AudioGraph | undefined,
  occurrence: string,
  leftOccurrence: string,
  rightOccurrence: string,
  plan: SplitAudioGraphPlan | undefined,
): AudioGraph | undefined {
  if (graph === undefined) {
    assert(plan === undefined, "Audio split plan was supplied for a Programme without Audio.");
    return undefined;
  }
  const references = audioOccurrenceReferences(graph, occurrence);
  if (references.length === 0) {
    assert(plan === undefined, `Audio graph does not reference split Occurrence ${occurrence}.`);
    return structuredClone(graph);
  }
  assert(plan !== undefined, `Audio graph references split Occurrence ${occurrence} but has no split plan.`);
  if (plan.kind === "split-uses") {
    assertNoControlledAudioReference(graph, occurrence);
    return splitAudioUses(graph, occurrence, leftOccurrence, rightOccurrence, plan.uses)!;
  }
  const replacement = structuredClone(plan.graph);
  assertReplacementRemovedOccurrence("Audio", occurrence,
    audioOccurrenceReferences(replacement, occurrence));
  return replacement;
}

export function splitProgramOccurrence(value: AudiovisualProgram, id: string,
  options: SplitProgramOccurrenceOptions): AudiovisualProgram {
  assertAudiovisualProgram(value);
  assertIdentity(id, "Audiovisual Programme split Occurrence id");
  assert(!Object.hasOwn(value.occurrences, options.leftId),
    `Audiovisual Programme ${value.id} already contains Occurrence ${options.leftId}.`);
  assert(!Object.hasOwn(value.occurrences, options.rightId),
    `Audiovisual Programme ${value.id} already contains Occurrence ${options.rightId}.`);
  const occurrence = Object.hasOwn(value.occurrences, id) ? value.occurrences[id] : undefined;
  assert(occurrence !== undefined, `Audiovisual Programme ${value.id} has no Occurrence ${id}.`);
  const [left, right] = splitOccurrence(occurrence, options);
  const occurrences = structuredClone(value.occurrences) as Record<string, Occurrence>;
  delete occurrences[id];
  occurrences[left.id] = left;
  occurrences[right.id] = right;
  return sealAudiovisualProgram({ id: value.id, domain: structuredClone(value.domain),
    ...(value.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(value.pictureDomain) }),
    occurrences,
    ...(value.picture === undefined ? {} : { picture: splitPictureGraph(value.picture, id,
      left.id, right.id, options.picture)! }),
    ...(value.audio === undefined ? {} : { audio: splitAudioGraph(value.audio, id,
      left.id, right.id, options.audio)! }),
  });
}
