import { createExactModelPrimaryGenerationFragment } from "@hypit/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput, ExactModelTextInput } from "@hypit/model-kit";

/** Model result projection over the same graph-native request assembly as every exact model. */
export function createTtsAudioFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
  textInputs: readonly ExactModelTextInput[] = [],
) {
  return createExactModelPrimaryGenerationFragment(endpoint, mediaInputs, textInputs);
}
