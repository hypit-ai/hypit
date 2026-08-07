export type SpeechEstimateLanguage = "auto" | "en" | "zh" | "ja" | "es";
export type ResolvedSpeechEstimateLanguage = Exclude<SpeechEstimateLanguage, "auto">;
export type SpeechEstimatePace = "slow" | "normal" | "fast";
export type SpeechEstimateRounding = "none" | "round" | "ceil";

export type SpeechEstimatePolicy = {
  readonly contract: "svml.speech-estimate-policy@1";
  readonly language: SpeechEstimateLanguage;
  readonly pace: SpeechEstimatePace;
  readonly paddingSec: number;
  readonly minimumSec: number;
  readonly maximumSec: number;
  readonly rounding: SpeechEstimateRounding;
};
