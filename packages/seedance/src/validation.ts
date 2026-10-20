import type { ModelFieldBuilder } from "@hypit/generation/model-fields";
import type { BlobRef } from "@hypit/hypit/protocol";

/** Seedance's reference-audio rule, shared by known imports and request assembly. */
export function validateSeedanceAudio(artifact: BlobRef, subject = "Seedance reference audio"): void {
  if (artifact.mediaType === "audio/mp4" || artifact.mediaType === "audio/x-m4a") {
    throw new Error(`${subject} does not accept m4a; convert the reference audio to WAV or MP3 before using it (media:ExtractAudio produces WAV)`);
  }
}

/** Missing references in a draft remain graph inputs; only supplied audio is checked. */
export function validateSeedanceInputs(request: ModelFieldBuilder): void {
  for (const value of request.ports.referenceAudio ?? []) {
    if (typeof value === "object" && value.role === "audio") validateSeedanceAudio(value.artifact);
  }
}
