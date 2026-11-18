import { assertLocalTemporalDomain, compareExactTemporalValues } from "@hypit/temporal/algebra";
import { assertAudioGraph, audioGraphUses } from "./audio.js";
import { assertIdentity } from "@hypit/nle";
import { assertOccurrence } from "./occurrence.js";
import { assertPictureGraph, pictureGraphUses } from "./picture.js";
import { assertLocalSpatialDomain } from "./spatial.js";
import type { CompilationGraph } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameDomain(left: CompilationGraph["domain"], right: CompilationGraph["domain"]): boolean {
  return left.id === right.id && compareExactTemporalValues(left.duration, right.duration) === 0;
}

export function assertCompilationGraph(value: CompilationGraph): void {
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
  const uses = [
    ...(value.picture === undefined ? [] : pictureGraphUses(value.picture)),
    ...(value.audio === undefined ? [] : audioGraphUses(value.audio)),
  ];
  const usedOccurrences = new Set(uses.map((use) => use.occurrence));
  for (const id of Object.keys(value.occurrences)) {
    assert(usedOccurrences.has(id), `Programme ${value.id} contains unused Occurrence ${id}.`);
  }
  const usedSelections = new Set(uses.map((use) => `${use.occurrence}\u0000${use.output}`));
  for (const occurrence of Object.values(value.occurrences)) {
    for (const output of Object.keys(occurrence.selections)) {
      assert(usedSelections.has(`${occurrence.id}\u0000${output}`),
        `Occurrence ${occurrence.id} contains unused output Selection ${output}.`);
    }
  }
}

export function sealCompilationGraph(value: CompilationGraph): CompilationGraph {
  assertCompilationGraph(value);
  return structuredClone(value);
}
