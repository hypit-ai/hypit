import { createFieldModelPrimaryFragment } from "@hypit/generation/model-fields";
import type { FieldModelOperation, ModelArtifactInput, ModelTextInput } from "@hypit/generation/model-fields";

/** Model result projection over the same graph-native request assembly as every exact model. */
export function createMimoSpeechAudioFragment(
  endpoint: FieldModelOperation,
  mediaInputs: readonly ModelArtifactInput[] = [],
  textInputs: readonly ModelTextInput[] = [],
) {
  return createFieldModelPrimaryFragment(endpoint, mediaInputs, textInputs);
}
