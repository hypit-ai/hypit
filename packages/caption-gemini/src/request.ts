import { assertCaptionProgramForNarrative } from "@svml/caption";
import type { CaptionFieldDeclaration, CaptionProgram } from "@svml/caption";
import type { Narrative } from "@svml/contracts";
import { digestOf, isDigest } from "@svml/protocol";

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
  return `${field.id}: ${field.minimumPerCue}..${field.maximumPerCue} atom assignments per cue; value=${value}. ${field.instruction}`;
}

export function captionGeminiSystemInstruction(runs: readonly CaptionPlanningRun[]): string {
  const styleRules = new Map<string, CaptionPlanningRun>();
  runs.forEach((run) => styleRules.set(run.styleId, run));
  return [
    "You are a caption cue and per-word attribute planner. Display atoms are immutable author truth.",
    "Return only response-schema JSON. Never return corrected text, replacement text, pronunciation text, timestamps, Markdown, or explanations.",
    "Each run is a hard boundary. Plan every run independently; a cue may never cross a run boundary.",
    "Within each run, cues must preserve and exactly partition atom_ids. Return only each cue's final after_atom_id; the final cue must end at the run's final atom.",
    "Every field assignment targets exactly one atom inside its cue and uses a field declared by that run's style.",
    ...[...styleRules.values()].flatMap((run) => [
      `Style ${run.styleId} cue judgment: ${run.cueInstruction.trim()}`,
      ...run.fields.map((field) => `Style ${run.styleId} field ${fieldInstruction(field)}`),
    ]),
    "Echo every run exactly once. Use an empty fields array when no declaration applies. Never invent ids.",
  ].join("\n");
}

function promptContent(request: Pick<CaptionGeminiRequest, "atoms" | "runs">): string {
  return JSON.stringify({
    display_atoms: request.atoms,
    runs: request.runs.map((run) => ({
      run_id: run.id,
      style_id: run.styleId,
      atom_ids: run.atomIds,
      cue_instruction: run.cueInstruction,
      field_declarations: run.fields,
    })),
  }, null, 2);
}

function requestContent(value: Omit<CaptionGeminiRequest, "requestDigest">) {
  return {
    contract: "svml.caption-gemini-request@1" as const,
    model: value.model,
    narrativeDigest: value.narrativeDigest,
    captionProgramDigest: value.captionProgramDigest,
    atoms: value.atoms.map((atom) => ({ ...atom })),
    runs: value.runs.map((run) => ({
      id: run.id,
      styleId: run.styleId,
      atomIds: [...run.atomIds],
      cueInstruction: run.cueInstruction.trim(),
      fields: run.fields.map((field) => structuredClone(field)),
    })),
    systemInstruction: value.systemInstruction,
    prompt: value.prompt,
    temperature: 0.2 as const,
  };
}

export function compileCaptionGeminiRequest(
  narrative: Narrative,
  captionProgram: CaptionProgram,
  program: CaptionGeminiProgram,
): CaptionGeminiRequest {
  assertCaptionProgramForNarrative(captionProgram, narrative);
  verifyCaptionGeminiProgram(program);
  const styles = new Map(captionProgram.styles.map((style) => [style.id, style]));
  const runs = captionProgram.runs.map((run) => {
    const style = styles.get(run.styleId);
    assert(style !== undefined, `Caption run ${run.id} references an unknown Style`);
    return {
      id: run.id,
      styleId: run.styleId,
      atomIds: [...run.atomIds],
      cueInstruction: style.planning.cueInstruction,
      fields: style.planning.fields.map((field) => structuredClone(field)),
    };
  });
  const base = {
    contract: "svml.caption-gemini-request@1" as const,
    model: program.model,
    narrativeDigest: captionProgram.narrativeDigest,
    captionProgramDigest: captionProgram.digest,
    atoms: captionProgram.atoms.map((atom) => ({ id: atom.id, text: atom.text })),
    runs,
  };
  const systemInstruction = captionGeminiSystemInstruction(runs);
  const prompt = promptContent(base);
  const content = requestContent({ ...base, systemInstruction, prompt, temperature: 0.2 });
  const request = { ...content, requestDigest: digestOf(content) };
  verifyCaptionGeminiRequest(request);
  return request;
}

export function verifyCaptionGeminiRequest(value: unknown): asserts value is CaptionGeminiRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Caption Gemini request must be an object");
  const request = value as CaptionGeminiRequest;
  assert(request.contract === "svml.caption-gemini-request@1", "Caption Gemini request contract is invalid");
  assert(request.model === "gemini-2.5-flash" || request.model === "gemini-3.1-pro-preview", "Caption Gemini request model is unsupported");
  assert(isDigest(request.narrativeDigest) && isDigest(request.captionProgramDigest) && isDigest(request.requestDigest),
    "Caption Gemini request identity is invalid");
  assert(request.temperature === 0.2, "Caption Gemini temperature is not the package-owned value");
  assert(Array.isArray(request.atoms) && request.atoms.length > 0, "Caption Gemini request atoms are empty");
  const atomIds = request.atoms.map((atom) => atom.id);
  assert(atomIds.every((id) => typeof id === "string" && id.length > 0) && new Set(atomIds).size === atomIds.length,
    "Caption Gemini atom ids are invalid or repeated");
  assert(request.atoms.every((atom) => typeof atom.text === "string" && atom.text.length > 0),
    "Caption Gemini display atom text is invalid");
  const atomSet = new Set(atomIds);
  const planned = request.runs.flatMap((run) => run.atomIds);
  assert(request.runs.length > 0 && planned.length === atomIds.length && new Set(planned).size === atomIds.length
    && planned.every((id) => atomSet.has(id)), "Caption Gemini runs are not an exact display-atom partition");
  assert(request.runs.every((run) => run.atomIds.length > 0 && run.cueInstruction.trim().length > 0),
    "Caption Gemini request contains an empty run");
  assert(request.systemInstruction === captionGeminiSystemInstruction(request.runs),
    "Caption Gemini system instruction differs from the model package");
  assert(request.prompt === promptContent(request), "Caption Gemini prompt differs from immutable display facts");
  const { requestDigest: _digest, ...withoutDigest } = request;
  assert(request.requestDigest === digestOf(requestContent(withoutDigest)), "Caption Gemini request digest does not match its contents");
}
