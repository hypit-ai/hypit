import { createFieldModelPrimaryFragment } from "@hypit/generation-model/model-fields";
import type { FieldModelOperation, ModelArtifactInput, ModelTextFieldInput } from "@hypit/generation-model/model-fields";

/** Model result projection over the same graph-native request assembly as every exact model. */
export function createElevenLabsSpeechAudioFragment(
  endpoint: FieldModelOperation,
  mediaInputs: readonly ModelArtifactInput[] = [],
  textFieldInputs: readonly ModelTextFieldInput[] = [],
) {
  return createFieldModelPrimaryFragment(endpoint, mediaInputs, textFieldInputs);
}
