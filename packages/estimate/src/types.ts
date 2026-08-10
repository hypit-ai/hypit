export type SpeechEstimateLanguage = "auto" | "en" | "zh" | "ja" | "es";
export type ResolvedSpeechEstimateLanguage = Exclude<SpeechEstimateLanguage, "auto">;
export type SpeechEstimatePace = "slow" | "normal" | "fast";
export type SpeechEstimateRounding = "none" | "round" | "ceil";

type SpeechEstimatePolicyBase = {
  readonly contract: "svml.speech-estimate-policy@1";
  readonly language: SpeechEstimateLanguage;
  readonly minimumSec: number;
  readonly maximumSec: number;
  readonly rounding: SpeechEstimateRounding;
};

export type SpeechEstimatePolicy = SpeechEstimatePolicyBase & (
  | { readonly pace: SpeechEstimatePace; readonly rate?: never }
  | { readonly pace?: never; readonly rate: number }
);
