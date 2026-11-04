import { compareExactTemporalValues } from "@hypit/temporal/algebra";
import { compareCodeUnits } from "@hypit/protocol";

import { assertAudiovisualProgram } from "./program.js";
import { projectNleOccurrences } from "./projection.js";
import type {
  AudiovisualProgram,
  NleOccurrenceOutputProjection,
  NleOccurrenceProjection,
  NleView,
  NleViewItemProjection,
  NleViewProjection,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function memberKey(occurrence: string, output: string): string {
  return `${occurrence}\u0000${output}`;
}

function findOccurrence(
  occurrences: readonly NleOccurrenceProjection[],
  id: string,
): NleOccurrenceProjection | undefined {
  return occurrences.find((occurrence) => occurrence.id === id);
}

function findOutput(
  occurrence: NleOccurrenceProjection,
  name: string,
): NleOccurrenceOutputProjection | undefined {
  return occurrence.outputs.find((output) => output.name === name);
}

/**
 * Validate only presentation membership. Placement, Mapping, paint order and routing remain Programme facts.
 * Empty lanes are valid because a row is a workbench concern, not a signal container.
 */
export function assertNleView(value: NleView, program: AudiovisualProgram): void {
  assertAudiovisualProgram(program);
  assertIdentity(value.id, "NleView.id");
  assert(value.program === program.id,
    `NLE View ${value.id} observes Programme ${value.program}, not ${program.id}.`);
  const laneIds = new Set<string>();
  const members = new Set<string>();
  for (const lane of value.lanes) {
    assertIdentity(lane.id, `NLE View ${value.id} lane id`);
    assert(!laneIds.has(lane.id), `NLE View ${value.id} repeats lane ${lane.id}.`);
    laneIds.add(lane.id);
    if (lane.label !== undefined) {
      assert(lane.label.trim().length > 0, `NLE View ${value.id} lane ${lane.id} has an empty label.`);
    }
    for (const member of lane.members) {
      assertIdentity(member.occurrence, `NLE View ${value.id} occurrence member`);
      assertIdentity(member.output, `NLE View ${value.id} output member`);
      const occurrence = program.occurrences[member.occurrence];
      assert(occurrence !== undefined,
        `NLE View ${value.id} references missing Occurrence ${member.occurrence}.`);
      assert(Object.hasOwn(occurrence.selections, member.output),
        `NLE View ${value.id} references unselected output ${member.occurrence}.${member.output}.`);
      const key = memberKey(member.occurrence, member.output);
      assert(!members.has(key),
        `NLE View ${value.id} repeats member ${member.occurrence}.${member.output}.`);
      members.add(key);
    }
  }
}

export function sealNleView(value: NleView, program: AudiovisualProgram): NleView {
  assertNleView(value, program);
  return structuredClone(value);
}

/** Resolve View membership against the one authoritative Occurrence projection. */
export function projectNleView(value: NleView, program: AudiovisualProgram): NleViewProjection {
  assertNleView(value, program);
  const index = projectNleOccurrences(program);
  return {
    id: value.id,
    program: value.program,
    domain: structuredClone(index.domain),
    lanes: value.lanes.map((lane) => {
      const items: NleViewItemProjection[] = lane.members.map((member) => {
        const occurrence = findOccurrence(index.occurrences, member.occurrence)!;
        const output = findOutput(occurrence, member.output)!;
        return {
          occurrence: occurrence.id,
          output: output.name,
          source: occurrence.source,
          type: structuredClone(output.type),
          parentRange: structuredClone(occurrence.parentRange),
          activeLocalRange: structuredClone(occurrence.activeLocalRange),
          usedBy: structuredClone(output.usedBy),
          ...(output.kind === "constant" ? { kind: "constant" as const } : {
            kind: "signal" as const,
            sourceDomain: structuredClone(output.sourceDomain),
            mapping: structuredClone(output.mapping),
          }),
        };
      });
      items.sort((left, right) => compareExactTemporalValues(left.parentRange.start, right.parentRange.start)
        || compareCodeUnits(left.occurrence, right.occurrence)
        || compareCodeUnits(left.output, right.output));
      return {
        id: lane.id,
        ...(lane.label === undefined ? {} : { label: lane.label }),
        items,
      };
    }),
  };
}

/** Replace one projected Occurrence membership with its two explicit split identities. */
export function splitNleViewOccurrence(
  value: NleView,
  occurrence: string,
  leftOccurrence: string,
  rightOccurrence: string,
): NleView {
  assertIdentity(occurrence, "NLE View split Occurrence id");
  assertIdentity(leftOccurrence, "NLE View split left Occurrence id");
  assertIdentity(rightOccurrence, "NLE View split right Occurrence id");
  assert(leftOccurrence !== rightOccurrence, "NLE View split Occurrence ids must be distinct.");
  let replacements = 0;
  const lanes = value.lanes.map((lane) => ({
    ...structuredClone(lane),
    members: lane.members.flatMap((member) => {
      if (member.occurrence !== occurrence) return [structuredClone(member)];
      replacements += 1;
      return [
        { occurrence: leftOccurrence, output: member.output },
        { occurrence: rightOccurrence, output: member.output },
      ];
    }),
  }));
  assert(replacements > 0, `NLE View ${value.id} has no membership for Occurrence ${occurrence}.`);
  return { id: value.id, program: value.program, lanes };
}
