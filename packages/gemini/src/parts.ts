/** Provider-neutral inline parts used by embedded Gemini callers before a Runtime Artifact exists. */
export type GeminiInlinePart =
  | { readonly text: string; readonly inlineData?: never }
  | { readonly inlineData: { readonly mimeType: string; readonly data: string }; readonly text?: never };

export type GeminiGenerateInput = {
  readonly parts: readonly GeminiInlinePart[];
  readonly instruction: string;
};
