import {
  assertLocalTemporalDomain,
  assertTemporalMapRegionSet,
} from "@hypit/temporal/algebra";

import type { CaptionDocument, CaptionSelection, LocalCaptionTiming } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function unique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    identity(value, label);
    assert(!seen.has(value), `${label} repeats ${value}.`);
    seen.add(value);
  }
}

export function assertCaptionDocument(value: CaptionDocument): void {
  identity(value.id, "CaptionDocument id");
  unique(value.units.map((unit) => unit.id), "CaptionDocument unit id");
  unique(value.words.map((word) => word.id), "CaptionDocument word id");
  unique(value.cues.map((cue) => cue.id), "CaptionDocument cue id");
  const units = new Map(value.units.map((unit) => [unit.id, unit]));
  const words = new Map(value.words.map((word) => [word.id, word]));
  for (const unit of value.units) {
    assert(unit.wordIds.length > 0, `Caption unit ${unit.id} has no words.`);
    unique(unit.wordIds, `Caption unit ${unit.id} word`);
    for (const wordId of unit.wordIds) {
      const word = words.get(wordId);
      assert(word !== undefined, `Caption unit ${unit.id} references missing word ${wordId}.`);
      assert(word.unitId === unit.id, `Caption word ${wordId} belongs to ${word.unitId}, not ${unit.id}.`);
    }
  }
  for (const word of value.words) {
    identity(word.unitId, `Caption word ${word.id} unit`);
    assert(units.has(word.unitId), `Caption word ${word.id} references missing unit ${word.unitId}.`);
    assert(word.text.length > 0, `Caption word ${word.id} is empty.`);
    assert(word.separatorBefore === "" || word.separatorBefore === " ",
      `Caption word ${word.id} separator is invalid.`);
    for (const attribute of word.attributes) {
      assert(/^[a-z][a-z0-9_-]{0,63}$/u.test(attribute.name),
        `Caption word ${word.id} attribute name is invalid.`);
      assert(typeof attribute.value === "string" || typeof attribute.value === "boolean"
        || typeof attribute.value === "number" && Number.isFinite(attribute.value),
      `Caption word ${word.id} attribute ${attribute.name} value is invalid.`);
    }
  }
  const assigned = new Set<string>();
  for (const cue of value.cues) {
    assert(cue.unitIds.length > 0, `Caption cue ${cue.id} has no units.`);
    unique(cue.unitIds, `Caption cue ${cue.id} unit`);
    for (const unitId of cue.unitIds) {
      assert(units.has(unitId), `Caption cue ${cue.id} references missing unit ${unitId}.`);
      assert(!assigned.has(unitId), `Caption unit ${unitId} belongs to more than one Cue.`);
      assigned.add(unitId);
    }
    if (cue.role !== undefined) assert(cue.role.trim().length > 0, `Caption cue ${cue.id} role is empty.`);
  }
  assert(assigned.size === value.units.length, "Caption Cues must partition all Units exactly.");
}

export function assertLocalCaptionTiming(value: LocalCaptionTiming): void {
  identity(value.documentId, "LocalCaptionTiming document id");
  assertLocalTemporalDomain(value.domain);
  unique(value.units.map((unit) => unit.unitId), "LocalCaptionTiming unit id");
  for (const unit of value.units) {
    assert(unit.regions.length > 0, `LocalCaptionTiming unit ${unit.unitId} has no regions.`);
    assertTemporalMapRegionSet({ domain: value.domain, regions: unit.regions });
  }
}

export function assertCaptionSelection(value: CaptionSelection): void {
  assert(value.kind === "all" || value.kind === "cues" || value.kind === "units",
    "CaptionSelection kind is invalid.");
  if (value.kind !== "all") unique(value.ids, `CaptionSelection ${value.kind}`);
}

export function captionSelectedUnitIds(
  document: CaptionDocument,
  selection: CaptionSelection,
): readonly string[] {
  assertCaptionDocument(document);
  assertCaptionSelection(selection);
  if (selection.kind === "all") return document.units.map((unit) => unit.id);
  if (selection.kind === "units") {
    const known = new Set(document.units.map((unit) => unit.id));
    for (const id of selection.ids) assert(known.has(id), `Caption selection references missing unit ${id}.`);
    return [...selection.ids];
  }
  const cues = new Map(document.cues.map((cue) => [cue.id, cue]));
  return selection.ids.flatMap((id) => {
    const cue = cues.get(id);
    assert(cue !== undefined, `Caption selection references missing cue ${id}.`);
    return cue.unitIds;
  });
}
