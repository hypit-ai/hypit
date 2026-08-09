import { createExactModelPrimaryGenerationFragment } from "@narratage/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput } from "@narratage/model-kit";

/** Model result projection over the same graph-native request assembly as every exact model. */
export function createMimoTtsAudioFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
) {
  return createExactModelPrimaryGenerationFragment(endpoint, mediaInputs);
}
