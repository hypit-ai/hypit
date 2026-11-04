import {
  addExactTemporalValues,
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";
import type { ExactTemporalValue, TemporalMap, TemporalRange } from "@hypit/temporal/algebra";
import { assertLocalSpatialDomain } from "@hypit/spatial/algebra";

import { assertAudioGraph, audioGraphUses } from "./audio.js";
import { audioType, pictureType } from "./identity.js";
import {
  assertOccurrence,
  moveOccurrence,
  occurrenceParentRange,
  remapOccurrence,
  sealOccurrence,
  splitOccurrence,
  trimOccurrence,
} from "./occurrence.js";
import { assertPictureGraph, pictureGraphUses } from "./picture.js";
import type {
  AudioGraph,
  AudiovisualProgram,
  Occurrence,
  PictureGraph,
  ProgramSource,
  RippleTrimProgramOccurrenceOptions,
  RollProgramOccurrencesOptions,
  SplitProgramOccurrenceOptions,
  SplitUseNodeIds,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function sameDomain(left: AudiovisualProgram["domain"], right: AudiovisualProgram["domain"]): boolean {
  return left.id === right.id && compareExactTemporalValues(left.duration, right.duration) === 0;
}

export function assertAudiovisualProgram(value: AudiovisualProgram): void {
  assertIdentity(value.id, "AudiovisualProgram.id");
  assertLocalTemporalDomain(value.domain);
  assert(value.picture !== undefined || value.audio !== undefined, `Audiovisual Programme ${value.id} has no outputs.`);
  if (value.picture === undefined) {
    assert(value.pictureDomain === undefined,
      `Audio-only Audiovisual Programme ${value.id} contains an unused Picture spatial domain.`);
  } else {
    assert(value.pictureDomain !== undefined,
      `Audiovisual Programme ${value.id} Picture has no output spatial domain.`);
    assertLocalSpatialDomain(value.pictureDomain);
  }
  for (const [id, occurrence] of Object.entries(value.occurrences)) {
    assertIdentity(id, "Audiovisual Programme Occurrence id");
    assert(id === occurrence.id, `Occurrence key ${id} does not match identity ${occurrence.id}.`);
    assertOccurrence(occurrence);
    assert(sameDomain(occurrence.placement.parent, value.domain),
      `Occurrence ${id} belongs to parent domain ${occurrence.placement.parent.id}, not ${value.domain.id}.`);
  }
  if (value.picture !== undefined) assertPictureGraph(value.picture, value);
  if (value.audio !== undefined) assertAudioGraph(value.audio, value);

  const uses = [
    ...(value.picture === undefined ? [] : pictureGraphUses(value.picture)),
    ...(value.audio === undefined ? [] : audioGraphUses(value.audio)),
  ];
  const usedOccurrences = new Set(uses.map((use) => use.occurrence));
  for (const id of Object.keys(value.occurrences)) {
    assert(usedOccurrences.has(id), `Audiovisual Programme ${value.id} contains unused Occurrence ${id}.`);
  }
  const usedMappings = new Set(uses.map((use) => `${use.occurrence}\u0000${use.output}`));
  for (const occurrence of Object.values(value.occurrences)) {
    for (const output of Object.keys(occurrence.selections)) {
      assert(usedMappings.has(`${occurrence.id}\u0000${output}`),
        `Occurrence ${occurrence.id} contains unused output Mapping ${output}.`);
    }
  }
}

export function sealAudiovisualProgram(value: AudiovisualProgram): AudiovisualProgram {
  assertAudiovisualProgram(value);
  return structuredClone(value);
}

/** A closed Programme is an ordinary multi-output Source; nesting adds no Compound category. */
export function audiovisualProgramSource(value: AudiovisualProgram, id = value.id): ProgramSource {
  assertAudiovisualProgram(value);
  assertIdentity(id, "Audiovisual Programme Source id");
  return {
    id,
    outputs: {
      ...(value.picture === undefined ? {} : { picture: {
        kind: "signal" as const,
        type: pictureType,
        domain: structuredClone(value.domain),
        spatialDomain: structuredClone(value.pictureDomain!),
      } }),
      ...(value.audio === undefined ? {} : { audio: { kind: "signal" as const, type: audioType, domain: structuredClone(value.domain) } }),
    },
  };
}

export function audiovisualProgramOccurrences(value: AudiovisualProgram): readonly Occurrence[] {
  assertAudiovisualProgram(value);
  return Object.values(value.occurrences).map((occurrence) => structuredClone(occurrence));
}

function replaceOccurrence(
  value: AudiovisualProgram,
  id: string,
  edit: (occurrence: Occurrence) => Occurrence,
): AudiovisualProgram {
  assertAudiovisualProgram(value);
  assertIdentity(id, "Audiovisual Programme Occurrence edit id");
  const occurrence = Object.hasOwn(value.occurrences, id) ? value.occurrences[id] : undefined;
  assert(occurrence !== undefined, `Audiovisual Programme ${value.id} has no Occurrence ${id}.`);
  const replacement = edit(occurrence);
  assert(replacement.id === id, `Occurrence edit changed identity ${id} to ${replacement.id}.`);
  return sealAudiovisualProgram({
    ...structuredClone(value),
    occurrences: { ...structuredClone(value.occurrences), [id]: replacement },
  });
}

/** Move the one authoritative Occurrence; every View derives the new rectangle on its next projection. */
export function moveProgramOccurrence(
  value: AudiovisualProgram,
  id: string,
  start: ExactTemporalValue,
): AudiovisualProgram {
  return replaceOccurrence(value, id, (occurrence) => moveOccurrence(occurrence, start));
}

/** Trim the one authoritative active local range without touching View membership. */
export function trimProgramOccurrence(
  value: AudiovisualProgram,
  id: string,
  active: TemporalRange,
): AudiovisualProgram {
  return replaceOccurrence(value, id, (occurrence) => trimOccurrence(occurrence, active));
}

/** Change one output's source relation without moving the shared audiovisual Occurrence. */
export function remapProgramOccurrence(
  value: AudiovisualProgram,
  id: string,
  output: string,
  mapping: TemporalMap,
): AudiovisualProgram {
  return replaceOccurrence(value, id, (occurrence) => remapOccurrence(occurrence, output, mapping));
}

/**
 * Atomically replace any explicit subset of one Occurrence's output relations.
 * Slip, reverse, hold, loop and variable speed differ in how callers construct these Maps, not in AVIR shape.
 */
export function slipProgramOccurrence(
  value: AudiovisualProgram,
  id: string,
  mappings: Readonly<Record<string, TemporalMap>>,
): AudiovisualProgram {
  assert(Object.keys(mappings).length > 0, "Occurrence slip must replace at least one output Mapping.");
  return replaceOccurrence(value, id, (occurrence) => {
    const next: Record<string, import("./types.js").OccurrenceOutputSelection> = structuredClone(occurrence.selections);
    for (const [output, mapping] of Object.entries(mappings)) {
      assertIdentity(output, "Occurrence slip output");
      const selection = next[output];
      assert(selection !== undefined,
        `Occurrence ${occurrence.id} does not select Source output ${output}.`);
      assert(selection.kind === "signal",
        `Occurrence ${occurrence.id}.${output} is constant and cannot be slipped.`);
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

/** Atomically move one explicitly named shared parent boundary; Mapping semantics remain unchanged. */
export function rollProgramOccurrences(
  value: AudiovisualProgram,
  options: RollProgramOccurrencesOptions,
): AudiovisualProgram {
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
  const rolledLeft = trimOccurrence(left, {
    start: left.placement.active.start,
    end: addExactTemporalValues(left.placement.active.end, delta),
  });
  const rolledRight = trimOccurrence(right, {
    start: addExactTemporalValues(right.placement.active.start, delta),
    end: right.placement.active.end,
  });
  return sealAudiovisualProgram({
    ...structuredClone(value),
    occurrences: {
      ...structuredClone(value.occurrences),
      [left.id]: rolledLeft,
      [right.id]: rolledRight,
    },
  });
}

/**
 * Trim one explicit boundary, then move only the caller-supplied Occurrences by that boundary's delta.
 * The scope is transient command input; Programme and View store no ripple group or lane inference.
 */
export function rippleTrimProgramOccurrence(
  value: AudiovisualProgram,
  id: string,
  options: RippleTrimProgramOccurrenceOptions,
): AudiovisualProgram {
  assertAudiovisualProgram(value);
  assert(options.boundary === "start" || options.boundary === "end",
    "Ripple boundary must be start or end.");
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
  const delta = subtractExactTemporalValues(
    options.boundary === "start" ? after.start : after.end,
    options.boundary === "start" ? before.start : before.end,
  );
  const occurrences = structuredClone(value.occurrences) as Record<string, Occurrence>;
  occurrences[id] = trimmed;
  for (const occurrenceId of scope) {
    const occurrence = occurrences[occurrenceId]!;
    occurrences[occurrenceId] = moveOccurrence(
      occurrence,
      addExactTemporalValues(occurrence.placement.start, delta),
    );
  }
  return sealAudiovisualProgram({ ...structuredClone(value), occurrences });
}

function assertSplitUseIds(
  graph: "Picture" | "Audio",
  originalNode: string,
  ids: SplitUseNodeIds,
  existing: Readonly<Record<string, unknown>>,
  allocated: Set<string>,
): void {
  assertIdentity(ids.left, `${graph} split left use node for ${originalNode}`);
  assertIdentity(ids.right, `${graph} split right use node for ${originalNode}`);
  assert(ids.left !== ids.right, `${graph} split use nodes for ${originalNode} must be distinct.`);
  for (const id of [ids.left, ids.right]) {
    assert(!Object.hasOwn(existing, id), `${graph} split use node ${id} already exists.`);
    assert(!allocated.has(id), `${graph} split use node ${id} is allocated more than once.`);
    allocated.add(id);
  }
}

function splitPictureUses(
  graph: PictureGraph | undefined,
  occurrence: string,
  leftOccurrence: string,
  rightOccurrence: string,
  supplied: Readonly<Record<string, SplitUseNodeIds>> | undefined,
): PictureGraph | undefined {
  if (graph === undefined) {
    assert(supplied === undefined || Object.keys(supplied).length === 0,
      "Picture split use ids were supplied for a Programme without Picture.");
    return undefined;
  }
  const affected = Object.entries(graph.nodes).filter(([, node]) =>
    node.kind === "use" && node.occurrence === occurrence);
  const expected = new Set(affected.map(([id]) => id));
  const provided = supplied ?? {};
  for (const id of Object.keys(provided)) {
    assert(expected.has(id), `Picture split specifies unrelated use node ${id}.`);
  }
  for (const id of expected) {
    assert(Object.hasOwn(provided, id), `Picture split is missing use node identities for ${id}.`);
  }
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

function splitAudioUses(
  graph: AudioGraph | undefined,
  occurrence: string,
  leftOccurrence: string,
  rightOccurrence: string,
  supplied: Readonly<Record<string, SplitUseNodeIds>> | undefined,
): AudioGraph | undefined {
  if (graph === undefined) {
    assert(supplied === undefined || Object.keys(supplied).length === 0,
      "Audio split use ids were supplied for a Programme without Audio.");
    return undefined;
  }
  const affected = Object.entries(graph.nodes).filter(([, node]) =>
    node.kind === "use" && node.occurrence === occurrence);
  const expected = new Set(affected.map(([id]) => id));
  const provided = supplied ?? {};
  for (const id of Object.keys(provided)) {
    assert(expected.has(id), `Audio split specifies unrelated use node ${id}.`);
  }
  for (const id of expected) {
    assert(Object.hasOwn(provided, id), `Audio split is missing use node identities for ${id}.`);
  }
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

/**
 * Split one Occurrence and atomically close every affected signal use.
 * The original use node id becomes a time-disjoint `over`/`mix`, so downstream references remain stable.
 */
export function splitProgramOccurrence(
  value: AudiovisualProgram,
  id: string,
  options: SplitProgramOccurrenceOptions,
): AudiovisualProgram {
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
  return sealAudiovisualProgram({
    id: value.id,
    domain: structuredClone(value.domain),
    ...(value.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(value.pictureDomain) }),
    occurrences,
    ...(value.picture === undefined ? {} : { picture: splitPictureUses(value.picture, id,
      left.id, right.id, options.pictureUses)! }),
    ...(value.audio === undefined ? {} : { audio: splitAudioUses(value.audio, id,
      left.id, right.id, options.audioUses)! }),
  });
}
