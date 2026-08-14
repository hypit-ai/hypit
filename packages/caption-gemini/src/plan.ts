import { assertCaptionPlan, sealCaptionPlan } from "@narratage/caption";
import type { CaptionFieldDeclaration, CaptionPlannedCue } from "@narratage/caption";

import { verifyCaptionGeminiRequest } from "./request.js";
import type {
  CaptionGeminiPlan,
  CaptionGeminiRequest,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], subject: string): void {
  assert(Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"), `${subject} has unknown or missing fields`);
}

function fieldValue(declaration: CaptionFieldDeclaration, value: unknown): string {
  assert(typeof value === "string", `Caption field ${declaration.id} value must be a string`);
  if (declaration.value.kind === "boolean") {
    assert(value === "true", `Caption field ${declaration.id} is sparse: absence means false`);
  } else if (declaration.value.kind === "enum") {
    assert(declaration.value.values.includes(value), `Caption field ${declaration.id} enum value is invalid`);
  } else {
    const number = Number(value);
    assert(Number.isFinite(number), `Caption field ${declaration.id} number value is invalid`);
    assert(declaration.value.minimum === undefined || number >= declaration.value.minimum,
      `Caption field ${declaration.id} value is below its minimum`);
    assert(declaration.value.maximum === undefined || number <= declaration.value.maximum,
      `Caption field ${declaration.id} value is above its maximum`);
  }
  return value;
}

function cueFromRaw(
  raw: unknown,
  runId: string,
  cueIndex: number,
  runAtoms: CaptionGeminiRequest["runs"][number]["atoms"],
  cursor: number,
  declarations: ReadonlyMap<string, CaptionFieldDeclaration>,
): { readonly cue: CaptionPlannedCue; readonly nextCursor: number } {
  const value = object(raw, `Caption cue ${runId}/${cueIndex + 1}`);
  exactKeys(value, ["atom_count", "fields"], `Caption cue ${runId}/${cueIndex + 1}`);
  assert(Number.isSafeInteger(value.atom_count) && (value.atom_count as number) > 0,
    `Caption cue ${runId}/${cueIndex + 1} atom count is invalid`);
  const nextCursor = cursor + (value.atom_count as number);
  assert(nextCursor <= runAtoms.length, `Caption cue ${runId}/${cueIndex + 1} exceeds its remaining atoms`);
  const cueAtoms = runAtoms.slice(cursor, nextCursor);
  assert(Array.isArray(value.fields), `Caption cue ${runId}/${cueIndex + 1} fields are invalid`);
  const assignments = value.fields.map((rawField, fieldIndex) => {
    const field = object(rawField, `Caption field ${runId}/${cueIndex + 1}/${fieldIndex + 1}`);
    exactKeys(field, ["declaration_id", "atom_number", "word_number", "value"], "Caption field assignment");
    assert(typeof field.declaration_id === "string", "Caption field declaration id is invalid");
    const declaration = declarations.get(field.declaration_id);
    assert(declaration !== undefined, `Caption field ${field.declaration_id} was not declared for run ${runId}`);
    assert(Number.isSafeInteger(field.atom_number)
      && (field.atom_number as number) >= 1 && (field.atom_number as number) <= cueAtoms.length,
    `Caption field ${declaration.id} Atom number lies outside its cue`);
    const atom = cueAtoms[(field.atom_number as number) - 1]!;
    assert(Number.isSafeInteger(field.word_number)
      && (field.word_number as number) >= 1 && (field.word_number as number) <= atom.words.length,
    `Caption field ${declaration.id} word number lies outside its Atom`);
    return {
      declarationId: declaration.id,
      wordId: atom.words[(field.word_number as number) - 1]!.id,
      value: fieldValue(declaration, field.value),
    };
  });
  const unique = new Set(assignments.map((field) => `${field.declarationId}\0${field.wordId}`));
  assert(unique.size === assignments.length, `Caption cue ${runId}/${cueIndex + 1} repeats a field assignment`);
  for (const declaration of declarations.values()) {
    const count = assignments.filter((field) => field.declarationId === declaration.id).length;
    assert(count >= declaration.minimumPerCue && count <= declaration.maximumPerCue,
      `Caption field ${declaration.id} count ${count} violates ${declaration.minimumPerCue}..${declaration.maximumPerCue} per cue`);
  }
  return {
    cue: { id: `${runId}:cue:${cueIndex + 1}`, atomIds: cueAtoms.map((atom) => atom.id), fields: assignments },
    nextCursor,
  };
}

export function sealCaptionGeminiPlan(
  request: CaptionGeminiRequest,
  response: unknown,
): CaptionGeminiPlan {
  verifyCaptionGeminiRequest(request);
  const root = object(response, "Caption Gemini response");
  exactKeys(root, ["runs"], "Caption Gemini response");
  assert(Array.isArray(root.runs), "Caption Gemini response runs are invalid");
  assert(root.runs.length === request.runs.length, "Caption Gemini response does not contain the exact run set");
  const rawRuns: Record<string, unknown>[] = [];
  for (const rawRun of root.runs) {
    const run = object(rawRun, "Caption Gemini response run");
    exactKeys(run, ["cues"], "Caption Gemini response run");
    rawRuns.push(run);
  }
  const runs = request.runs.map((expectedRun, runIndex) => {
    const rawRun = rawRuns[runIndex];
    assert(rawRun !== undefined && Array.isArray(rawRun.cues) && rawRun.cues.length > 0,
      `Caption run ${expectedRun.id} has no Cues`);
    const declarations = new Map(expectedRun.fields.map((field) => [field.id, field]));
    let cursor = 0;
    const cues = rawRun.cues.map((rawCue, cueIndex) => {
      const planned = cueFromRaw(rawCue, expectedRun.id, cueIndex, expectedRun.atoms, cursor, declarations);
      cursor = planned.nextCursor;
      return planned.cue;
    });
    assert(cursor === expectedRun.atoms.length, `Caption run ${expectedRun.id} Cues do not cover its final atom`);
    return { id: expectedRun.id, styleId: expectedRun.styleId, cues };
  });
  return sealCaptionPlan({

    runs,
  });
}

export function verifyCaptionGeminiPlan(value: unknown): asserts value is CaptionGeminiPlan {
  assertCaptionPlan(value);
}
