import { assertCaptionProgramForDisplay } from "@narratage/caption";
import type { CaptionFieldDeclaration, CaptionProgram } from "@narratage/caption";
import type { CaptionDisplaySequence } from "@narratage/narrative";

import { verifyCaptionGeminiProgram } from "./program.js";
import type {
  CaptionGeminiProgram,
  CaptionGeminiRequest,
  CaptionPlanningRun,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fieldPromptDeclaration(field: CaptionFieldDeclaration) {
  return {
    id: field.id,
    value: field.value.kind === "enum"
      ? { kind: "enum", values: [...field.value.values] }
      : field.value.kind === "number"
        ? {
            kind: "number",
            ...(field.value.minimum === undefined ? {} : { minimum: field.value.minimum }),
            ...(field.value.maximum === undefined ? {} : { maximum: field.value.maximum }),
          }
        : { kind: "boolean", sparse_true: true },
    per_cue: { minimum: field.minimumPerCue, maximum: field.maximumPerCue },
    instruction: field.instruction,
  };
}

export function captionGeminiSystemInstruction(): string {
  return [
    "You are a caption cue and per-word attribute planner. Display words are immutable author truth.",
    "Return only response-schema JSON. Never return corrected text, replacement text, pronunciation text, timestamps, Markdown, or explanations.",
    "Each run is a hard boundary. Plan every run independently; a cue may never cross a run boundary.",
    "Each inner array in atoms is one indivisible display atom; each string inside it is one immutable display word including its authored punctuation.",
    "Group consecutive whole atoms into cues; never split, rewrite, omit, repeat, or reorder an atom or word.",
    "Count the inner-array words when applying cue_words. If one atom alone exceeds the preferred maximum, keep it whole as its own cue.",
    "For every cue, atom_count is the number of consecutive unread atoms it consumes. The atom counts must partition the run exactly.",
    "Every field assignment targets one display word by one-based atom_number inside its cue and one-based word_number inside that atom.",
    "Return every run exactly once and in input order. Use an empty fields array when no declaration applies.",
  ].join("\n");
}

function promptContent(request: Pick<CaptionGeminiRequest, "runs">): string {
  return JSON.stringify({
    runs: request.runs.map((run) => ({
      atoms: run.atoms.map((atom) => atom.words.map((word) => word.text)),
      cue_words: { minimum: run.cueMinimumWords, maximum: run.cueMaximumWords },
      cue_instruction: run.cueInstruction,
      ...(run.fields.length === 0 ? {} : {
        field_declarations: run.fields.map((field) => fieldPromptDeclaration(field)),
      }),
    })),
  }, null, 2);
}

function requestContent(value: CaptionGeminiRequest) {
  return {
    contract: "svml.caption-gemini-request@1" as const,
    model: value.model,
    runs: value.runs.map((run) => ({
      id: run.id,
      styleId: run.styleId,
      atoms: run.atoms.map((atom) => ({
        id: atom.id,
        words: atom.words.map((word) => ({ ...word })),
      })),
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
  display: CaptionDisplaySequence,
  captionProgram: CaptionProgram,
  program: CaptionGeminiProgram,
): CaptionGeminiRequest {
  assertCaptionProgramForDisplay(captionProgram, display);
  verifyCaptionGeminiProgram(program);
  const styles = new Map(captionProgram.styles.map((style) => [style.id, style]));
  const wordById = new Map(display.words.map((word) => [word.id, word]));
  const atomById = new Map(display.atoms.map((atom) => [atom.id, atom]));
  const runs = captionProgram.runs.map((run) => {
    const style = styles.get(run.styleId);
    assert(style !== undefined, `Caption run ${run.id} references an unknown Style`);
    return {
      id: run.id,
      styleId: run.styleId,
      atoms: [...new Set(run.wordIds.map((wordId) => wordById.get(wordId)?.atomId))].map((atomId) => {
        assert(atomId !== undefined, `Caption run ${run.id} references an unknown display word`);
        const atom = atomById.get(atomId);
        assert(atom !== undefined, `Caption run ${run.id} references unknown Atom ${atomId}`);
        return {
          id: atom.id,
          words: atom.wordIds.map((wordId) => {
            const word = wordById.get(wordId);
            assert(word !== undefined, `Caption Atom ${atom.id} references unknown word ${wordId}`);
            return { id: word.id, text: word.text };
          }),
        };
      }),
      cueMinimumWords: style.planning.cue.minimumWords,
      cueMaximumWords: style.planning.cue.maximumWords,
      cueInstruction: style.planning.cue.instruction,
      fields: style.planning.fields.map((field) => structuredClone(field)),
    };
  });
  const base = {
    contract: "svml.caption-gemini-request@1" as const,
    model: program.model,
    runs,
  };
  const systemInstruction = captionGeminiSystemInstruction();
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
  assert(Array.isArray(request.runs) && request.runs.length > 0, "Caption Gemini request runs are empty");
  const plannedAtoms = request.runs.flatMap((run: CaptionPlanningRun) =>
    run.atoms.map((atom: CaptionPlanningRun["atoms"][number]) => atom.id));
  const plannedWords = request.runs.flatMap((run: CaptionPlanningRun) =>
    run.atoms.flatMap((atom: CaptionPlanningRun["atoms"][number]) =>
      atom.words.map((word: CaptionPlanningRun["atoms"][number]["words"][number]) => word.id)));
  assert(plannedAtoms.length > 0 && new Set(plannedAtoms).size === plannedAtoms.length
    && plannedWords.length > 0 && new Set(plannedWords).size === plannedWords.length,
    "Caption Gemini atoms repeat or omit internal display-word identities");
  assert(request.runs.every((run) => run.atoms.length > 0
    && run.atoms.every((atom: CaptionPlanningRun["atoms"][number]) =>
      atom.id.length > 0 && atom.words.length > 0
      && atom.words.every((word) => word.id.length > 0 && word.text.trim().length > 0))
    && Number.isSafeInteger(run.cueMinimumWords) && run.cueMinimumWords > 0
    && Number.isSafeInteger(run.cueMaximumWords) && run.cueMaximumWords >= run.cueMinimumWords
    && run.cueInstruction.trim().length > 0),
    "Caption Gemini request contains an empty run");
  assert(request.systemInstruction === captionGeminiSystemInstruction(),
    "Caption Gemini system instruction differs from the model package");
  assert(request.prompt === promptContent(request), "Caption Gemini prompt differs from immutable display facts");
}
