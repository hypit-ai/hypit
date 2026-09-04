import { canonicalize } from "@hypit/protocol";

/** What Gemini saw in the supplied media. It is evidence for the author, not production Text. */
export type VisualObservation = { readonly text: string };

export function verifyVisualObservation(value: unknown): asserts value is VisualObservation {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof (value as { readonly text?: unknown }).text !== "string"
    || (value as { readonly text: string }).text.trim().length === 0) {
    throw new Error("Visual Observation must contain non-empty text");
  }
}

export function sealVisualObservation(text: string): VisualObservation {
  const result = canonicalize({ text }) as unknown as VisualObservation;
  verifyVisualObservation(result);
  return result;
}
