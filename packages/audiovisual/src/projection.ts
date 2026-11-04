import { compareExactTemporalValues } from "@hypit/temporal/algebra";
import { compareCodeUnits } from "@hypit/protocol";

import { occurrenceParentRange } from "./occurrence.js";
import { assertAudiovisualProgram } from "./program.js";
import { audioGraphUses } from "./audio.js";
import { pictureGraphUses } from "./picture.js";
import type {
  AudiovisualProgram,
  NleOccurrenceIndex,
  NleOccurrenceProjection,
} from "./types.js";

function useKey(occurrence: string, output: string): string {
  return `${occurrence}\u0000${output}`;
}

/**
 * Project resolved Occurrences into NLE rectangles without inventing Tracks, lanes or frame positions.
 * Mapping remains the authority for source-local sampling; this index only derives parent coverage.
 */
export function projectNleOccurrences(value: AudiovisualProgram): NleOccurrenceIndex {
  assertAudiovisualProgram(value);
  const roles = new Map<string, Set<"picture" | "audio">>();
  for (const use of value.picture === undefined ? [] : pictureGraphUses(value.picture)) {
    const key = useKey(use.occurrence, use.output);
    const entry = roles.get(key) ?? new Set<"picture" | "audio">();
    entry.add("picture");
    roles.set(key, entry);
  }
  for (const use of value.audio === undefined ? [] : audioGraphUses(value.audio)) {
    const key = useKey(use.occurrence, use.output);
    const entry = roles.get(key) ?? new Set<"picture" | "audio">();
    entry.add("audio");
    roles.set(key, entry);
  }

  const occurrences: NleOccurrenceProjection[] = Object.values(value.occurrences).map((occurrence) => ({
    id: occurrence.id,
    source: occurrence.source.id,
    parentRange: occurrenceParentRange(occurrence),
    activeLocalRange: structuredClone(occurrence.placement.active),
    outputs: Object.entries(occurrence.selections).map(([name, selection]) => {
      const output = occurrence.source.outputs[name]!;
      const base = {
        name,
        type: structuredClone(output.type),
        usedBy: [...(roles.get(useKey(occurrence.id, name)) ?? [])].sort(),
      };
      return selection.kind === "constant"
        ? { ...base, kind: "constant" as const }
        : {
            ...base,
            kind: "signal" as const,
            sourceDomain: structuredClone((output as Extract<typeof output, { kind: "signal" }>).domain),
            mapping: structuredClone(selection.mapping),
            ...(selection.reconstruction === undefined ? {} : {
              reconstruction: structuredClone(selection.reconstruction),
            }),
          };
    }).sort((left, right) => compareCodeUnits(left.name, right.name)),
  }));
  occurrences.sort((left, right) => compareExactTemporalValues(left.parentRange.start, right.parentRange.start)
    || compareCodeUnits(left.id, right.id));
  return {
    program: value.id,
    domain: structuredClone(value.domain),
    occurrences,
  };
}
