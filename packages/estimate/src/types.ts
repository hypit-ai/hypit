export type SpeechEstimateLanguage = "auto" | "en" | "zh" | "ja" | "es";
export type ResolvedSpeechEstimateLanguage = Exclude<SpeechEstimateLanguage, "auto">;
export type SpeechEstimatePace = "slow" | "normal" | "fast";
export type SpeechEstimateRounding = "none" | "round" | "ceil";

type SpeechEstimatePolicyBase = {
  readonly language: SpeechEstimateLanguage;
  readonly rounding: SpeechEstimateRounding;
  readonly paddingSec?: number;
};

export type SpeechEstimatePolicy = SpeechEstimatePolicyBase & (
  | { readonly pace: SpeechEstimatePace; readonly rate?: never }
  | { readonly pace?: never; readonly rate: number }
);
