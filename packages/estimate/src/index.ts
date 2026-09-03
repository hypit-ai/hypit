export { estimateManifest, estimateModuleRef, estimateTypes, speechEstimatePolicySchema } from "./manifest.js";
export {
  speechEstimatePolicyFromAttributes,
  speechEstimatePolicyFromRecipe,
  speechEstimatePolicyProperties,
} from "./policy.js";
export {
  assertSpeechEstimatePolicy,
  countSpeechEstimateUnits,
  detectSpeechEstimateLanguage,
  estimateSpeechDuration,
  resolveSpeechEstimateLanguage,
  resolveSpeechEstimateRate,
  sealSpeechEstimatePolicy,
} from "./program.js";
export type * from "./types.js";
