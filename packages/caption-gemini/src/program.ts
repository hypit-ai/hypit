import { digestOf, isDigest } from "@svml/protocol";

import type { CaptionGeminiProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function content(program: Omit<CaptionGeminiProgram, "programDigest">) {
  return {
    contract: "svml.caption-gemini-program@1" as const,
    model: program.model,
  };
}

export function verifyCaptionGeminiProgram(value: unknown): asserts value is CaptionGeminiProgram {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Caption Gemini Program must be an object");
  const program = value as CaptionGeminiProgram;
  assert(program.contract === "svml.caption-gemini-program@1", "Caption Gemini Program contract is invalid");
  assert(program.model === "gemini-2.5-flash" || program.model === "gemini-3.1-pro-preview",
    "Caption Gemini model is unsupported");
  assert(isDigest(program.programDigest), "Caption Gemini Program digest is invalid");
  const { programDigest: _digest, ...withoutDigest } = program;
  assert(program.programDigest === digestOf(content(withoutDigest)), "Caption Gemini Program digest does not match its contents");
}

export function sealCaptionGeminiProgram(
  value: Omit<CaptionGeminiProgram, "programDigest">,
): CaptionGeminiProgram {
  const normalized = content(value);
  const program = { ...normalized, programDigest: digestOf(normalized) };
  verifyCaptionGeminiProgram(program);
  return program;
}
