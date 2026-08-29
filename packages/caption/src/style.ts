import type { CaptionDocument, Narrative } from "@hypit/narrative";
import { canonicalStringify, canonicalize } from "@hypit/protocol";

import {
  assertCaptionDocument,
  captionUnitsForRole,
  type CaptionUnitSubset,
} from "./display.js";
import type {
  CaptionMuteApplication,
  CaptionProgram,
  CaptionStyleApplication,
  CaptionStyleIntent,
  CaptionWordStyleApplication,
} from "./types.js";

export type { CaptionMuteApplication, CaptionStyleApplication, CaptionWordStyleApplication } from "./types.js";

const ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export function sealCaptionStyle(value: CaptionStyleIntent): CaptionStyleIntent {
  const result = canonicalize({
    id: value.id,
    rendering: { family: value.rendering.family.trim(), parameters: canonicalize(value.rendering.parameters) },
  }) as unknown as CaptionStyleIntent;
  assertCaptionStyle(result);
  return result;
}

export function assertCaptionStyle(value: CaptionStyleIntent): void {
  assert(ID.test(value.id), "Caption Style identity is invalid");
  assert(value.rendering.family.trim().length > 0, `Caption Style ${value.id} rendering family is empty`);
  canonicalize(value.rendering.parameters);
}

export function sealCaptionProgram(value: CaptionProgram): CaptionProgram {
  const result = canonicalize(value) as unknown as CaptionProgram;
  assertCaptionProgram(result);
  return result;
}

export function assertCaptionProgram(value: CaptionProgram): void {
  assert(ID.test(value.id), "Caption Program identity is invalid");
  assert(value.documentId.length > 0 && value.styles.length > 0 && value.runs.length > 0,
    "Caption Program is empty");
  const styles = new Map(value.styles.map((style) => [style.id, style]));
  assert(styles.size === value.styles.length, "Caption Program styles are repeated");
  value.styles.forEach(assertCaptionStyle);
  assert(new Set(value.runs.map((run) => run.id)).size === value.runs.length,
    "Caption Program run ids are repeated");
  const units = value.runs.flatMap((run) => run.unitIds);
  assert(new Set(units).size === units.length, "Caption Program runs repeat a unit");
  assert(value.runs.every((run) => styles.has(run.styleId) && run.unitIds.length > 0),
    "Caption Program run is invalid");
  assert(new Set(value.wordRuns.map((run) => run.id)).size === value.wordRuns.length,
    "Caption Program word run ids are repeated");
  const words = value.wordRuns.flatMap((run) => run.wordIds);
  assert(new Set(words).size === words.length, "Caption Program word runs repeat a word");
  assert(value.wordRuns.every((run) => styles.has(run.styleId) && run.wordIds.length > 0),
    "Caption Program word run is invalid");
  assert(new Set(value.mutedUnitIds).size === value.mutedUnitIds.length,
    "Caption Program muted units are repeated");
}

export function assertCaptionProgramForDocument(value: CaptionProgram, document: CaptionDocument): void {
  assertCaptionProgram(value);
  assertCaptionDocument(document);
  assert(value.documentId === document.id, "Caption Program belongs to another CaptionDocument");
  const expected = document.units.map((unit) => unit.id);
  assert(value.runs.flatMap((run) => run.unitIds).join("\0") === expected.join("\0"),
    "Caption Program must partition every Caption unit exactly once and in order");
  const known = new Set(expected);
  assert(value.mutedUnitIds.every((id) => known.has(id)), "Caption Program mutes an unknown unit");
  const knownWords = new Set(document.words.map((word) => word.id));
  assert(value.wordRuns.every((run) => run.wordIds.every((id) => knownWords.has(id))),
    "Caption Program styles an unknown display word");
}

function orderedSubset(value: CaptionUnitSubset, document: CaptionDocument): string[] {
  assertCaptionDocument(document);
  assert(value.documentId === document.id, "Caption unit subset belongs to another document");
  const order = new Map(document.units.map((unit, index) => [unit.id, index]));
  const indices = value.unitIds.map((id) => order.get(id));
  assert(indices.length > 0 && indices.every((index) => index !== undefined),
    "Caption unit subset contains an unknown unit");
  assert(indices.every((index, position) => position === 0 || index! > indices[position - 1]!),
    "Caption unit subset must be ordered and contain no repeated unit");
  return [...value.unitIds];
}

export function resolveCaptionProgram(
  document: CaptionDocument,
  narrative: Narrative,
  id: string,
  defaultStyle: CaptionStyleIntent,
  applications: readonly CaptionStyleApplication[],
  mutes: readonly CaptionMuteApplication[] = [],
  wordApplications: readonly CaptionWordStyleApplication[] = [],
): CaptionProgram {
  assertCaptionDocument(document);
  assertCaptionStyle(defaultStyle);
  const styles = new Map<string, CaptionStyleIntent>([[defaultStyle.id, defaultStyle]]);
  const selected = applications.map((application) => {
    assert(ID.test(application.id), "Caption Style Application identity is invalid");
    assertCaptionStyle(application.style);
    const unitIds = orderedSubset({ documentId: document.id, unitIds: application.unitIds }, document);
    const previous = styles.get(application.style.id);
    assert(previous === undefined || canonicalStringify(previous) === canonicalStringify(application.style),
      `Caption Style ${application.style.id} has conflicting definitions`);
    styles.set(application.style.id, application.style);
    return { ...application, unitIds };
  });
  const muted = mutes.flatMap((application) => {
    assert(ID.test(application.id), "Caption Mute identity is invalid");
    return orderedSubset({ documentId: document.id, unitIds: application.unitIds }, document);
  });
  const wordChosen = new Map<string, string>();
  for (const application of wordApplications) {
    assert(ID.test(application.id), "Caption Word Style Application identity is invalid");
    assert(application.attribute.trim().length > 0, "Caption Word Style Application attribute is empty");
    assertCaptionStyle(application.style);
    const knownWordIds = new Set(document.words.map((word) => word.id));
    for (const wordId of application.wordIds) {
      assert(knownWordIds.has(wordId), `Caption Word Style Application references unknown word ${wordId}`);
      const previous = wordChosen.get(wordId);
      assert(previous === undefined || previous === application.style.id,
        `Caption word ${wordId} receives conflicting styles`);
      wordChosen.set(wordId, application.style.id);
    }
    const previous = styles.get(application.style.id);
    assert(previous === undefined || canonicalStringify(previous) === canonicalStringify(application.style),
      `Caption Style ${application.style.id} has conflicting definitions`);
    styles.set(application.style.id, application.style);
  }
  const chosen = new Map(document.units.map((unit) => [unit.id, defaultStyle.id]));
  for (const application of selected) for (const unitId of application.unitIds) chosen.set(unitId, application.style.id);
  const runs: CaptionProgram["runs"][number][] = [];
  for (const unit of document.units) {
    const styleId = chosen.get(unit.id)!;
    const previous = runs.at(-1);
    if (previous === undefined || previous.styleId !== styleId) {
      runs.push({ id: `${id}:run:${runs.length + 1}`, styleId, unitIds: [unit.id] });
    } else {
      runs[runs.length - 1] = { ...previous, unitIds: [...previous.unitIds, unit.id] };
    }
  }
  const wordRuns: CaptionProgram["wordRuns"][number][] = [];
  for (const [wordId, styleId] of wordChosen) {
    const previous = wordRuns.at(-1);
    if (previous === undefined || previous.styleId !== styleId) {
      wordRuns.push({ id: `${id}:word-run:${wordRuns.length + 1}`, styleId, wordIds: [wordId] });
    } else {
      wordRuns[wordRuns.length - 1] = { ...previous, wordIds: [...previous.wordIds, wordId] };
    }
  }
  const program = sealCaptionProgram({
    id,
    documentId: document.id,
    styles: [...styles.values()].filter((style) => [...chosen.values(), ...wordChosen.values()].includes(style.id)),
    runs,
    wordRuns,
    mutedUnitIds: [...new Set(muted)],
  });
  assertCaptionProgramForDocument(program, document);
  void narrative;
  return program;
}

export { captionUnitsForRole };
