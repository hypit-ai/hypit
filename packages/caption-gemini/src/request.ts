import { assertCaptionProgramForWords } from "@narratage/caption";
import type { CaptionFieldDeclaration, CaptionProgram } from "@narratage/caption";
import type { CaptionWordSequence } from "@narratage/narrative";

import { verifyCaptionGeminiProgram } from "./program.js";
import type {
  CaptionGeminiProgram,
  CaptionGeminiRequest,
  CaptionPlanningRun,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fieldInstruction(field: CaptionFieldDeclaration): string {
  const value = field.value.kind === "boolean"
    ? 'the string "true"; omit the assignment when the field does not apply'
    : field.value.kind === "enum"
      ? `one of ${field.value.values.map((item) => JSON.stringify(item)).join(", ")}`
      : "a finite base-10 number encoded as a string";
  return `${field.id}: ${field.minimumPerCue}..${field.maximumPerCue} word assignments per cue; value=${value}. ${field.instruction}`;
}

export function captionGeminiSystemInstruction(runs: readonly CaptionPlanningRun[]): string {
  const styleRules = new Map<string, CaptionPlanningRun>();
  runs.forEach((run) => styleRules.set(run.styleId, run));
  return [
    "You are a caption cue and per-word attribute planner. Display words are immutable author truth.",
    "Return only response-schema JSON. Never return corrected text, replacement text, pronunciation text, timestamps, Markdown, or explanations.",
    "Each run is a hard boundary. Plan every run independently; a cue may never cross a run boundary.",
    "Within each run, cues must preserve and exactly partition word_ids. Return only each cue's final after_word_id; the final cue must end at the run's final word.",
    "Every field assignment targets exactly one word inside its cue and uses a field declared by that run's style.",
    ...[...styleRules.values()].flatMap((run) => [
      `Style ${run.styleId} cue judgment (${run.cueMinimumWords}..${run.cueMaximumWords} words): ${run.cueInstruction.trim()}`,
      ...run.fields.map((field) => `Style ${run.styleId} field ${fieldInstruction(field)}`),
    ]),
    "Echo every run exactly once. Use an empty fields array when no declaration applies. Never invent ids.",
  ].join("\n");
}

function promptContent(request: Pick<CaptionGeminiRequest, "words" | "runs">): string {
  return JSON.stringify({
    display_words: request.words,
    runs: request.runs.map((run) => ({
      run_id: run.id,
      style_id: run.styleId,
      word_ids: run.wordIds,
      cue_minimum_words: run.cueMinimumWords,
      cue_maximum_words: run.cueMaximumWords,
      cue_instruction: run.cueInstruction,
      field_declarations: run.fields,
    })),
  }, null, 2);
}

function requestContent(value: CaptionGeminiRequest) {
  return {
    contract: "svml.caption-gemini-request@1" as const,
    model: value.model,
    words: value.words.map((word) => ({ ...word })),
    runs: value.runs.map((run) => ({
      id: run.id,
      styleId: run.styleId,
      wordIds: [...run.wordIds],
      cueMinimumWords: run.cueMinimumWords,
      cueMaximumWords: run.cueMaximumWords,
      cueInstruction: run.cueInstruction.trim(),
      fields: run.fields.map((field) => structuredClone(field)),
    })),
    systemInstruction: value.systemInstruction,
    prompt: value.prompt,
    temperature: 0.2 as const,
  };
}

export function compileCaptionGeminiRequest(
  words: CaptionWordSequence,
  captionProgram: CaptionProgram,
  program: CaptionGeminiProgram,
): CaptionGeminiRequest {
  assertCaptionProgramForWords(captionProgram, words);
  verifyCaptionGeminiProgram(program);
  const styles = new Map(captionProgram.styles.map((style) => [style.id, style]));
  const runs = captionProgram.runs.map((run) => {
    const style = styles.get(run.styleId);
    assert(style !== undefined, `Caption run ${run.id} references an unknown Style`);
    return {
      id: run.id,
      styleId: run.styleId,
      wordIds: [...run.wordIds],
      cueMinimumWords: style.planning.cue.minimumWords,
      cueMaximumWords: style.planning.cue.maximumWords,
      cueInstruction: style.planning.cue.instruction,
      fields: style.planning.fields.map((field) => structuredClone(field)),
    };
  });
  const base = {
    contract: "svml.caption-gemini-request@1" as const,
    model: program.model,
    words: words.words.map((word) => ({ id: word.id, text: word.text })),
    runs,
  };
  const systemInstruction = captionGeminiSystemInstruction(runs);
  const prompt = promptContent(base);
  const request = requestContent({ ...base, systemInstruction, prompt, temperature: 0.2 });
  verifyCaptionGeminiRequest(request);
  return request;
}

export function verifyCaptionGeminiRequest(value: unknown): asserts value is CaptionGeminiRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Caption Gemini request must be an object");
  const request = value as CaptionGeminiRequest;
  assert(request.contract === "svml.caption-gemini-request@1", "Caption Gemini request contract is invalid");
  assert(request.model === "gemini-2.5-flash" || request.model === "gemini-3.1-pro-preview", "Caption Gemini request model is unsupported");
  assert(request.temperature === 0.2, "Caption Gemini temperature is not the package-owned value");
  assert(Array.isArray(request.words) && request.words.length > 0, "Caption Gemini request words are empty");
  const wordIds = request.words.map((word) => word.id);
  assert(wordIds.every((id) => typeof id === "string" && id.length > 0) && new Set(wordIds).size === wordIds.length,
    "Caption Gemini word ids are invalid or repeated");
  assert(request.words.every((word) => typeof word.text === "string" && word.text.length > 0),
    "Caption Gemini display word text is invalid");
  const wordSet = new Set(wordIds);
  const planned = request.runs.flatMap((run) => run.wordIds);
  assert(request.runs.length > 0 && planned.length === wordIds.length && new Set(planned).size === wordIds.length
    && planned.every((id) => wordSet.has(id)), "Caption Gemini runs are not an exact display-word partition");
  assert(request.runs.every((run) => run.wordIds.length > 0
    && Number.isSafeInteger(run.cueMinimumWords) && run.cueMinimumWords > 0
    && Number.isSafeInteger(run.cueMaximumWords) && run.cueMaximumWords >= run.cueMinimumWords
    && run.cueInstruction.trim().length > 0),
    "Caption Gemini request contains an empty run");
  assert(request.systemInstruction === captionGeminiSystemInstruction(request.runs),
    "Caption Gemini system instruction differs from the model package");
  assert(request.prompt === promptContent(request), "Caption Gemini prompt differs from immutable display facts");
}
