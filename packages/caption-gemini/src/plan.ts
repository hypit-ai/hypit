import { assertCaptionPlan, sealCaptionPlan } from "@narratage/caption";
import type { CaptionFieldDeclaration, CaptionPlannedCue } from "@narratage/caption";

import { verifyCaptionGeminiRequest } from "./request.js";
import type {
  CaptionGeminiPlan,
  CaptionGeminiRequest,
  RawCaptionGeminiResponse,
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
  runWordIds: readonly string[],
  cursor: number,
  declarations: ReadonlyMap<string, CaptionFieldDeclaration>,
): { readonly cue: CaptionPlannedCue; readonly nextCursor: number } {
  const value = object(raw, `Caption cue ${runId}/${cueIndex + 1}`);
  exactKeys(value, ["after_word_id", "fields"], `Caption cue ${runId}/${cueIndex + 1}`);
  assert(typeof value.after_word_id === "string", `Caption cue ${runId}/${cueIndex + 1} endpoint is invalid`);
  const endpoint = runWordIds.indexOf(value.after_word_id, cursor);
  assert(endpoint >= cursor, `Caption cue ${runId}/${cueIndex + 1} endpoint is outside its remaining run`);
  const wordIds = runWordIds.slice(cursor, endpoint + 1);
  assert(Array.isArray(value.fields), `Caption cue ${runId}/${cueIndex + 1} fields are invalid`);
  const assignments = value.fields.map((rawField, fieldIndex) => {
    const field = object(rawField, `Caption field ${runId}/${cueIndex + 1}/${fieldIndex + 1}`);
    exactKeys(field, ["declaration_id", "word_id", "value"], "Caption field assignment");
    assert(typeof field.declaration_id === "string", "Caption field declaration id is invalid");
    const declaration = declarations.get(field.declaration_id);
    assert(declaration !== undefined, `Caption field ${field.declaration_id} was not declared for run ${runId}`);
    assert(typeof field.word_id === "string" && wordIds.includes(field.word_id),
      `Caption field ${declaration.id} word lies outside its cue`);
    return {
      declarationId: declaration.id,
      wordId: field.word_id,
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
    cue: { id: `${runId}:cue:${cueIndex + 1}`, wordIds, fields: assignments },
    nextCursor: endpoint + 1,
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
  const rawRuns = new Map<string, Record<string, unknown>>();
  for (const rawRun of root.runs) {
    const run = object(rawRun, "Caption Gemini response run");
    exactKeys(run, ["run_id", "cues"], "Caption Gemini response run");
    assert(typeof run.run_id === "string" && !rawRuns.has(run.run_id), "Caption Gemini response run id is invalid or repeated");
    rawRuns.set(run.run_id, run);
  }
  assert(rawRuns.size === request.runs.length, "Caption Gemini response does not contain the exact run set");
  const runs = request.runs.map((expectedRun) => {
    const rawRun = rawRuns.get(expectedRun.id);
    assert(rawRun !== undefined && Array.isArray(rawRun.cues) && rawRun.cues.length > 0,
      `Caption run ${expectedRun.id} has no Cues`);
    const declarations = new Map(expectedRun.fields.map((field) => [field.id, field]));
    let cursor = 0;
    const cues = rawRun.cues.map((rawCue, cueIndex) => {
      const planned = cueFromRaw(rawCue, expectedRun.id, cueIndex, expectedRun.wordIds, cursor, declarations);
      cursor = planned.nextCursor;
      assert(planned.cue.wordIds.length >= expectedRun.cueMinimumWords
        && planned.cue.wordIds.length <= expectedRun.cueMaximumWords,
      `Caption Cue ${planned.cue.id} violates ${expectedRun.cueMinimumWords}..${expectedRun.cueMaximumWords} words`);
      return planned.cue;
    });
    assert(cursor === expectedRun.wordIds.length, `Caption run ${expectedRun.id} Cues do not cover its final word`);
    return { id: expectedRun.id, styleId: expectedRun.styleId, cues };
  });
  return sealCaptionPlan({
    contract: "svml.caption-plan@1",
    runs,
  });
}

export function verifyCaptionGeminiPlan(value: unknown): asserts value is CaptionGeminiPlan {
  assertCaptionPlan(value);
}

export const rawCaptionGeminiResponseShape = null as unknown as RawCaptionGeminiResponse;
