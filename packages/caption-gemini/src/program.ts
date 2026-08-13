import type { CaptionGeminiProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function content(program: CaptionGeminiProgram) {
  return {

    model: program.model,
  };
}

export function verifyCaptionGeminiProgram(value: unknown): asserts value is CaptionGeminiProgram {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Caption Gemini Program must be an object");
  const program = value as CaptionGeminiProgram;
  assert(program.model === "gemini-2.5-flash" || program.model === "gemini-3.1-pro-preview",
    "Caption Gemini model is unsupported");
}

export function sealCaptionGeminiProgram(value: CaptionGeminiProgram): CaptionGeminiProgram {
  const normalized = content(value);
  const program = normalized;
  verifyCaptionGeminiProgram(program);
  return program;
}
