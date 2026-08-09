import type { ExactModelEndpoint, ExactModelMediaInput } from "@narratage/model-kit";
import type { ProducerRef } from "@narratage/protocol";
import { createSeedanceSpeechGenerationFragment } from "@narratage/seedance";

/**
 * Speaker is an authoring Kit, not another execution protocol. Once its prompt
 * program is compiled, it uses Seedance's ordinary graph-native request
 * assembly, including every runtime-produced media edge.
 */
export function createSeedanceSpeakerTakeFragment(
  endpoint: ExactModelEndpoint,
  compileRequestProducer: ProducerRef,
  mediaInputs: readonly ExactModelMediaInput[] = [],
) {
  return createSeedanceSpeechGenerationFragment(endpoint, compileRequestProducer, mediaInputs);
}
