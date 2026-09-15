/**
 * Alibaba Video Generation Fragment Builder
 * Mirrors the current Distribution API (same shape as @hypit/seedance).
 */

import { createExactModelPrimaryGenerationFragment } from "@hypit/model-kit";
import type {
  ExactModelEndpoint,
  ExactModelMediaInput,
  ExactModelTextInput,
} from "@hypit/model-kit";

/**
 * Builds the primary generation fragment for an Alibaba video endpoint.
 * `mediaInputs` carries reference-image bindings; `textInputs` carries the prompt.
 */
export function createAlibabaVideoAssembledGenerationFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
  textInputs: readonly ExactModelTextInput[] = [],
) {
  return createExactModelPrimaryGenerationFragment(endpoint, mediaInputs, textInputs);
}
